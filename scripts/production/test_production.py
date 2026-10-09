import copy
import fcntl
from importlib.machinery import SourceFileLoader
from importlib.util import module_from_spec, spec_from_loader
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError
from urllib.parse import quote

from . import probe, unattended
from .caddy import apply_route, candidate_config
from .cli import fresh_config
from .core import (API_URL, ORIGIN, VOLUME, CommandFailed, Refused, ReleaseState, deployment_lock,
                   inherited_lock, parse_env, private_path, redact, release_plan, validate_ci,
                   validate_config, validate_manifest, validate_model, validate_release_tag, validate_sha,
                   validate_web_bundle)
from .release import deploy, internal_verify, rollback, verify_image_ids
from .runtime import GITHUB_API, Runner, check_source, github_json, network_boundary

ROOT = Path(__file__).resolve().parents[2]
SHA = "a" * 40
POLL = "11111111-1111-4111-8111-111111111111"


def manifest(sha=SHA, tag=""):
    return {"RELEASE_SHA": sha, "API_IMAGE": "rank-vote-api:" + sha,
            "WEB_IMAGE": "rank-vote-web:" + sha, "API_IMAGE_ID": "sha256:" + "1" * 64,
            "WEB_IMAGE_ID": "sha256:" + "2" * 64, "PRODUCTION_URL": ORIGIN,
            "DEPLOYED_AT": "2026-09-15T12:00:00Z", "RELEASE_TAG": tag, "SMOKE_POLL_ID": POLL}


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.config = fresh_config()

    def test_accepts_generated_values_and_percent_encoded_password(self):
        validate_config(self.config)
        password = "0123456789abcdefABCD@:/%+!12345678"
        self.config["POSTGRES_APP_PASSWORD"] = password
        self.config["DATABASE_URL"] = "postgresql://rank_vote_app:" + quote(password, safe="") + "@postgres:5432/rank_vote_prod?schema=public"
        validate_config(self.config)

    def test_missing_empty_unknown_and_wrong_config_rejected_without_secrets(self):
        variants = []
        for key in self.config:
            missing = dict(self.config)
            del missing[key]
            variants.extend([missing, {**self.config, key: ""}])
        for key, value in (("PORT", "3001"), ("CORS_ORIGIN", "http://localhost:5173"),
                           ("CORS_ORIGIN", "https://other.example"), ("TRUSTED_PROXY_HOPS", "0"),
                           ("TRUSTED_PROXY_HOPS", "2"), ("EXTRA", "x"),
                           ("POSTGRES_APP_PASSWORD", "rank_vote"),
                           ("POSTGRES_BOOTSTRAP_PASSWORD", "postgres"),
                           ("POSTGRES_APP_PASSWORD", "password" * 8),
                           ("POSTGRES_APP_PASSWORD", "a" * 64)):
            variants.append({**self.config, key: value})
        for wrong in ("rank_vote", "rank_vote_test", "postgres"):
            variants.append({**self.config, "DATABASE_URL": self.config["DATABASE_URL"].replace("rank_vote_prod", wrong)})
        for wrong in ("localhost", "127.0.0.1", "postgres.evil"):
            variants.append({**self.config, "DATABASE_URL": self.config["DATABASE_URL"].replace("@postgres:", "@" + wrong + ":")})
        variants.extend([{**self.config, "DATABASE_URL": self.config["DATABASE_URL"] + "&sslmode=disable"},
                         {**self.config, "DATABASE_URL": "not a URL"},
                         {**self.config, "POSTGRES_BOOTSTRAP_PASSWORD": self.config["POSTGRES_APP_PASSWORD"]}])
        for variant in variants:
            with self.subTest(keys=list(variant)):
                with self.assertRaises(Refused) as error:
                    validate_config(variant)
                self.assertNotIn(self.config["POSTGRES_APP_PASSWORD"], str(error.exception))

    def test_literal_env_rejects_shell_substitution_duplicates_quotes(self):
        for text in ("A=$(cat /secret)", "A=`id`", "A='quoted'", "A=x\nA=y", "export A=x", "A=two words"):
            with self.assertRaises(Refused):
                parse_env(text)
        self.assertEqual(parse_env("# comment\nA=a%20b\n"), {"A": "a%20b"})

    def test_full_sha_only(self):
        for value in ("", "abc1234", "latest", "local", "g" * 40, "A" * 40, SHA + "x"):
            with self.assertRaises(Refused):
                validate_sha(value)

    def test_web_url_check_allows_router_base_but_rejects_development_api(self):
        validate_web_bundle('routerBase="http://localhost"; api="' + API_URL + '"')
        for endpoint in ("http://localhost:3000/api/v1", "http://localhost/api/v1",
                         "http://127.0.0.1:53000/api/v1", "http://[::1]:3000/api/v1"):
            with self.assertRaises(Refused):
                validate_web_bundle(API_URL + endpoint)
        with self.assertRaises(Refused):
            validate_web_bundle("http://localhost:3000/api/v1")

    def test_redacts_raw_encoded_url_and_sql_values(self):
        self.config["POSTGRES_APP_PASSWORD"] = "safe/@+password"
        text = " ".join(self.config.values()) + " " + quote(self.config["POSTGRES_APP_PASSWORD"], safe="")
        output = redact(text, self.config)
        for key in ("DATABASE_URL", "POSTGRES_APP_PASSWORD", "POSTGRES_BOOTSTRAP_PASSWORD"):
            self.assertNotIn(self.config[key], output)
        self.assertNotIn("safe%2F", output)

    def test_private_path_rejects_symlink_and_bad_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config"
            path.write_text("test")
            path.chmod(0o644)
            with self.assertRaises(Refused):
                private_path(path, 0o600)
            link = Path(directory) / "link"
            link.symlink_to(path)
            with self.assertRaises(Refused):
                private_path(link, 0o600)

    def test_subprocess_error_is_redacted_and_build_env_is_clean(self):
        runner = Runner(self.config, root=ROOT)
        with patch.dict(os.environ, {"DATABASE_URL": "private", "COMPOSE_FILE": "evil.yml",
                                     "GH_TOKEN": "token", "GITHUB_TOKEN": "token"}):
            clean = Runner(self.config, root=ROOT)
            for name in ("DATABASE_URL", "COMPOSE_FILE", "GH_TOKEN", "GITHUB_TOKEN"):
                self.assertNotIn(name, clean.environment)
        result = SimpleNamespace(returncode=1, stdout=self.config["DATABASE_URL"],
                                 stderr=self.config["POSTGRES_BOOTSTRAP_PASSWORD"])
        with patch("subprocess.run", return_value=result), self.assertRaises(Refused) as error:
            runner.run(["docker", "compose", "config"])
        self.assertNotIn(self.config["POSTGRES_BOOTSTRAP_PASSWORD"], str(error.exception))
        self.assertNotIn(self.config["DATABASE_URL"], str(error.exception))


class ModelTests(unittest.TestCase):
    # Docker Compose rendering is separately exercised by prod-check/prod-smoke;
    # pure tests also run on hosts that have Python/Node but no Docker CLI.
    def model(self, config):
        services = {}
        for name in ("postgres", "api", "web", "migrate"):
            services[name] = {"image": "postgres:17-alpine" if name == "postgres" else
                              f"rank-vote-{'api' if name == 'migrate' else name}:{SHA}",
                              "restart": "no" if name == "migrate" else "unless-stopped",
                              "pull_policy": "never"}
        services["postgres"].update(environment={"POSTGRES_DB": "postgres", "POSTGRES_USER": "rank_vote_bootstrap",
            "POSTGRES_PASSWORD": config["POSTGRES_BOOTSTRAP_PASSWORD"], "POSTGRES_APP_PASSWORD": config["POSTGRES_APP_PASSWORD"],
            "POSTGRES_INITDB_ARGS": "--auth-host=scram-sha-256"}, networks={"db": None}, volumes=[
                {"source": "postgres_data", "target": "/var/lib/postgresql/data"},
                {"source": str(ROOT / "docker/postgres/init-production.sql"), "read_only": True}])
        services["api"].update(environment={key: config[key] for key in ("DATABASE_URL", "PORT", "CORS_ORIGIN", "TRUSTED_PROXY_HOPS")},
            networks={"db": None, "api_proxy": {"aliases": ["rank-vote-api"]}}, scale=1, stop_grace_period="30s")
        services["web"].update(networks={"web": {"aliases": ["rank-vote-web"]}})
        services["migrate"].update(environment={"DATABASE_URL": config["DATABASE_URL"]}, networks={"db": None},
                                  command=["pnpm", "run", "db:deploy"])
        return {"name": "rank-vote-prod", "services": services, "networks": {
            "db": {"name": "rank-vote-prod-db", "internal": True}, "web": {"name": "web", "external": True},
            "api_proxy": {"name": "rank-vote-api-proxy", "external": True}},
            "volumes": {"postgres_data": {"name": VOLUME, "external": True}}}

    def test_model_rejects_unsafe_mutations(self):
        config = fresh_config()
        model = self.model(config)
        validate_model(model, SHA, config)
        mutations = [
            ("services.api.ports", ["3000:3000"]), ("services.postgres.ports", ["5432:5432"]),
            ("services.web.network_mode", "host"), ("services.api.build", "."),
            ("services.api.image", "rank-vote-api:latest"), ("services.web.image", "rank-vote-web:local"),
            ("services.api.scale", 2), ("services.api.stop_grace_period", "1s"),
            ("services.api.networks", {"web": None}), ("networks.db.internal", False),
            ("networks.api_proxy.external", False), ("volumes.postgres_data.external", False),
            ("volumes.postgres_data.name", "other"), ("services.migrate.restart", "always"),
            ("services.migrate.command", ["pnpm", "run", "db:migrate"]),
            ("services.api.environment.POSTGRES_PASSWORD", config["POSTGRES_BOOTSTRAP_PASSWORD"]),
        ]
        for dotted, value in mutations:
            with self.subTest(field=dotted):
                changed = copy.deepcopy(model)
                target = changed
                *parents, key = dotted.split(".")
                for parent in parents:
                    target = target[parent]
                target[key] = value
                with self.assertRaises(Refused):
                    validate_model(changed, SHA, config)


class SourceTests(unittest.TestCase):
    def test_ci_both_jobs_exact_main_latest_run(self):
        run = {"head_sha": SHA, "head_branch": "main", "event": "push", "conclusion": "success", "path": ".github/workflows/ci.yml"}
        jobs = [{"name": name, "conclusion": "success", "head_sha": SHA} for name in ("checks", "containers")]
        validate_ci(run, jobs, SHA)
        for changed in ({**run, "head_sha": "b" * 40}, {**run, "event": "pull_request"},
                        {**run, "head_branch": "feat/test"}, {**run, "conclusion": "failure"}):
            with self.assertRaises(Refused):
                validate_ci(changed, jobs, SHA)
        for conclusion in ("failure", "skipped", "cancelled", None):
            with self.assertRaises(Refused):
                validate_ci(run, [jobs[0], {**jobs[1], "conclusion": conclusion}], SHA)
        with self.assertRaises(Refused):
            validate_ci(run, jobs[:1], SHA)

    def test_source_dirty_wrong_sha_attached_and_non_main(self):
        class Fake:
            wrong = None
            def text(self, args):
                if args[1:3] == ["remote", "get-url"]:
                    return "git@github.com:avshukan/rank-vote.git"
                if args[1] == "rev-parse":
                    return "b" * 40 if self.wrong == "sha" else SHA
                return " M changed" if self.wrong == "dirty" else ""
            def run(self, args, **kwargs):
                if args[1] == "merge-base":
                    raise Refused("not ancestor")
                return SimpleNamespace(returncode=0 if self.wrong == "attached" else 1)
        for failure in ("sha", "dirty", "attached", "non-main"):
            fake = Fake()
            fake.wrong = failure
            with self.assertRaises(Refused):
                check_source(fake, SHA)

    def test_missing_volume_blocks_normal_preflight(self):
        class Fake:
            def text(self, args):
                return ""
            def json(self, args):
                return [{"Containers": {"caddy": {}}}]
            def run(self, args, **kwargs):
                if args[:3] == ["docker", "volume", "inspect"]:
                    raise Refused("volume missing")
                raise AssertionError(args)
        with self.assertRaisesRegex(Refused, "volume missing"):
            network_boundary(Fake(), {"Id": "caddy"})


class StateTests(unittest.TestCase):
    def test_lock_contention_failure_release_and_no_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lock"
            with deployment_lock(path):
                code = "from scripts.production.core import deployment_lock; import sys\nwith deployment_lock(sys.argv[1]): pass"
                result = subprocess.run(["python3", "-c", code, str(path)], cwd=ROOT, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
            try:
                with deployment_lock(path):
                    raise ValueError("failed operation")
            except ValueError:
                pass
            with deployment_lock(path):
                self.assertEqual(path.read_text(), "")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_manifests_transitions_and_failed_candidate_never_current(self):
        with tempfile.TemporaryDirectory() as directory:
            state = ReleaseState(directory)
            with self.assertRaises(Refused):
                state.rollback_target()
            first = manifest()
            second = manifest("b" * 40)
            state.prepare()
            self.assertIsNone(state.read("previous"))
            state.promote(first)
            state.prepare()
            self.assertEqual(state.read("current"), first)
            self.assertEqual(state.rollback_target(), first)
            state.promote(second)
            self.assertEqual(state.read("current"), second)
            self.assertEqual(state.read("previous"), first)
            self.assertEqual((Path(directory) / "current.env").stat().st_mode & 0o777, 0o600)
            self.assertFalse(list(Path(directory).glob(".pending-*")))
            with self.assertRaises(Refused):
                validate_manifest({**first, "DATABASE_URL": "secret"})
            self.assertNotIn("DATABASE_URL", (Path(directory) / "current.env").read_text())


class ProcessVerificationTests(unittest.TestCase):
    def test_docker_top_requires_pid_and_exactly_one_node_command(self):
        outputs = [
            ("PID                 COMMAND\n1234                node\n", True),
            ("PID COMMAND\n  1233 tini\n\t1234\tnode  \n1235 node-helper\n\n", True),
            ("PID COMMAND\n", False),
            ("PID COMMAND\n1233 tini\n1234 nodejs\n1235 node-helper\n", False),
            ("PID COMMAND\n1234 node\n1235 node\n", False),
        ]
        for output, accepted in outputs:
            with self.subTest(output=output):
                runner = Mock(spec=Runner)
                runner.compose.side_effect = lambda sha, args: SimpleNamespace(stdout=args[-1] + "-container\n")
                runner.json.return_value = [{"State": {"Status": "running", "Health": {"Status": "healthy"}},
                                             "Image": "sha256:test"}]
                def top(args):
                    self.assertEqual(args, ["docker", "top", "api-container", "-eo", "pid,comm"])
                    return output
                runner.text.side_effect = top
                images = {service: ("unused-tag", "sha256:test") for service in ("api", "web")}
                with patch("scripts.production.release.caddy_container"), \
                     patch("scripts.production.release.network_boundary"):
                    if accepted:
                        internal_verify(runner, SHA, images, migration=False)
                    else:
                        with self.assertRaisesRegex(Refused, "API must have exactly one Node process"):
                            internal_verify(runner, SHA, images, migration=False)
                runner.text.assert_called_once_with(["docker", "top", "api-container", "-eo", "pid,comm"])


class SequenceTests(unittest.TestCase):
    def run_release(self, failure=None, rollback_mode=False):
        operations = []
        class Fake:
            config = fresh_config()
            def compose(self, sha, args, **kwargs):
                operations.append(args)
                if "--exit-code-from" in args:
                    return SimpleNamespace(returncode=1 if failure == "migration" else 0,
                                           stdout="migration diagnostics", stderr=self.config["DATABASE_URL"])
                return SimpleNamespace(returncode=0, stdout="", stderr="")
        images = {"api": ("rank-vote-api:" + SHA, "sha256:" + "1" * 64),
                  "web": ("rank-vote-web:" + SHA, "sha256:" + "2" * 64)}
        with tempfile.TemporaryDirectory() as directory:
            state = ReleaseState(directory)
            state.promote(manifest())
            state.prepare()
            def build(*args):
                operations.append(["build"])
                if failure == "build":
                    raise Refused("build failed")
                return images
            def public(*args):
                operations.append(["public-smoke"])
                if failure == "smoke":
                    raise Refused("smoke failed")
                return POLL
            with patch("scripts.production.release.prepare_images", side_effect=build), \
                 patch("scripts.production.release.verify_image_ids"), \
                 patch("scripts.production.release.internal_verify"):
                if failure:
                    with self.assertRaises(Refused):
                        deploy(Fake(), state, SHA, public)
                    self.assertEqual(state.read("current"), manifest())
                elif rollback_mode:
                    confirmations = []
                    rollback(Fake(), state, lambda expected, _: confirmations.append(expected), public)
                    self.assertEqual(confirmations, ["COMPATIBLE " + SHA])
                else:
                    deploy(Fake(), state, SHA, public)
                for log in Path(directory).glob("*.log"):
                    self.assertNotIn(Fake.config["DATABASE_URL"], log.read_text())
                    self.assertIn("migration diagnostics", log.read_text())
        return operations

    def test_build_failure_leaves_application_untouched(self):
        self.assertEqual(self.run_release("build"), [["build"]])

    def test_migration_failure_prevents_application_start_and_preserves_db(self):
        operations = self.run_release("migration")
        self.assertIn(["stop", "web", "api"], operations)
        self.assertFalse(any(operation[-1] in ("api", "web") and operation[0] == "up" for operation in operations))
        self.assertEqual(sum("--exit-code-from" in operation for operation in operations), 1)
        self.assertFalse(any("down" in operation for operation in operations))

    def test_success_orders_build_stop_migrate_api_web_smoke(self):
        operations = self.run_release()
        stages = ["build" if op == ["build"] else "stop" if op[0] == "stop" else
                  "smoke" if op == ["public-smoke"] else op[-1] for op in operations]
        self.assertEqual(stages, ["build", "stop", "postgres", "migrate", "api", "web", "smoke"])

    def test_failed_public_smoke_does_not_promote(self):
        self.run_release("smoke")

    def test_rollback_never_builds_migrates_or_operates_database(self):
        operations = self.run_release(rollback_mode=True)
        self.assertFalse(any("build" in op or "migrate" in op or "postgres" in op for op in operations))
        self.assertEqual(operations[0], ["stop", "web", "api"])

    def test_rollback_without_previous_or_confirmation_cannot_stop_services(self):
        with tempfile.TemporaryDirectory() as directory:
            state = ReleaseState(directory)
            with self.assertRaises(Refused):
                rollback(None, state, None, None)
            state.write("previous", manifest())
            def no(*args):
                raise Refused("compatibility uncertain")
            with self.assertRaises(Refused):
                rollback(None, state, no, None)

    def test_saved_image_identity_cannot_be_replaced_by_same_tag(self):
        image = manifest()
        class Fake:
            def json(self, args):
                return [{"Id": "sha256:" + "9" * 64,
                         "Config": {"Labels": {"org.opencontainers.image.revision": SHA}, "Cmd": ["node", "dist/main.js"]}}]
        with self.assertRaises(Refused):
            verify_image_ids(Fake(), SHA, {"api": (image["API_IMAGE"], image["API_IMAGE_ID"])})

    def test_caddy_append_preserves_sites_and_refuses_duplicate(self):
        previous = "old.example {\n respond ok\n}\n"
        snippet = (ROOT / "deploy/Caddyfile.rank-vote").read_text()
        candidate = candidate_config(previous, snippet)
        self.assertTrue(candidate.startswith(previous))
        self.assertIn("path /api/v1 /api/v1/*", candidate)
        self.assertIn("header_up X-Forwarded-For {remote_host}", candidate)
        with self.assertRaises(Refused):
            candidate_config(candidate, snippet)

    def test_caddy_invalid_candidate_does_not_write_or_reload(self):
        self.caddy_failure("validate")

    def test_caddy_failed_reload_restores_previous_file_and_config(self):
        self.caddy_failure("reload")

    def caddy_failure(self, failure):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Caddyfile"
            previous = "old.example {\n respond existing-site\n}\n"
            snippet = (ROOT / "deploy/Caddyfile.rank-vote").read_text()
            path.write_text(previous)
            operations = []
            class Fake:
                def run(self, args, input_text, **kwargs):
                    action = "reload" if "reload" in args else "validate"
                    operations.append((action, input_text))
                    if action == failure and snippet in input_text:
                        raise Refused("candidate failed")
            caddy = {"Id": "test-caddy", "Mounts": [{"Source": str(path), "Destination": "/etc/caddy/Caddyfile"}]}
            with patch("scripts.production.caddy.local_host"), \
                 patch("scripts.production.caddy.caddy_container", return_value=caddy), self.assertRaises(Refused):
                apply_route(Fake(), path, ROOT / "deploy/Caddyfile.rank-vote")
            self.assertEqual(path.read_text(), previous)
            if failure == "validate":
                self.assertFalse(any(action == "reload" for action, _ in operations))
                self.assertFalse(path.with_name("Caddyfile.before-rank-vote").exists())
            else:
                self.assertEqual(operations[-1], ("reload", previous))
                self.assertEqual(path.with_name("Caddyfile.before-rank-vote").read_text(), previous)

    def test_production_scripts_have_no_destructive_database_commands(self):
        for path in (ROOT / "scripts/production").glob("*.py"):
            if path.name in ("test_production.py", "container_smoke.py"):
                continue
            source = path.read_text()
            for forbidden in ("--volumes", "volume", "db push", "force-reset", "migrate resolve"):
                if forbidden == "volume":
                    self.assertNotIn('["docker", "volume", "rm"', source)
                else:
                    self.assertNotIn(forbidden, source)



# ---------------------------------------------------------------------------
# Tagged releases (ID-42)

CURRENT = "c" * 40
CANDIDATE = "d" * 40
NEW_POLL = "22222222-2222-4222-8222-222222222222"


def load_wrapper():
    loader = SourceFileLoader("rank_vote_release", str(ROOT / "deploy/rank-vote-release"))
    module = module_from_spec(spec_from_loader(loader.name, loader))
    loader.exec_module(module)
    return module


class FakeResponse:
    def __init__(self, body, status=200, url=None):
        self.body, self.status, self.url = body, status, url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.body

    def geturl(self):
        return self.url


class GitHubApiTests(unittest.TestCase):
    def opener(self, outcome):
        seen = []

        def open_url(request, timeout):
            seen.append((request, timeout))
            if isinstance(outcome, BaseException):
                raise outcome
            return outcome(request)
        return open_url, seen

    def test_unauthenticated_https_read_of_the_public_api(self):
        open_url, seen = self.opener(lambda request: FakeResponse(b'{"ok": true}', url=request.full_url))
        self.assertEqual(github_json("rules/branches/main", open_url), {"ok": True})
        request, timeout = seen[0]
        self.assertEqual(request.full_url, "https://api.github.com/repos/avshukan/rank-vote/rules/branches/main")
        self.assertTrue(GITHUB_API.startswith("https://"))
        self.assertFalse(any(name.lower() == "authorization" for name, _ in request.header_items()))
        self.assertEqual(timeout, 20)

    def test_every_failure_refuses(self):
        headers = {"x-ratelimit-remaining": "0"}
        cases = [
            (HTTPError("u", 403, "Forbidden", headers, None), "rate limit"),
            (HTTPError("u", 429, "Too Many", {}, None), "rate limit"),
            (HTTPError("u", 404, "Not Found", {}, None), "HTTP 404"),
            (HTTPError("u", 500, "Error", {}, None), "HTTP 500"),
            (URLError("no route"), "network or TLS"),
            (OSError("certificate verify failed"), "network or TLS"),
            (TimeoutError("timed out"), "network or TLS"),
            (lambda request: FakeResponse(b"{not json", url=request.full_url), "malformed JSON"),
            (lambda request: FakeResponse(b"{}", status=204, url=request.full_url), "unexpectedly"),
            (lambda request: FakeResponse(b"{}", url="https://evil.example/"), "unexpectedly"),
        ]
        for outcome, message in cases:
            with self.subTest(message=message, outcome=outcome):
                open_url, _ = self.opener(outcome)
                with self.assertRaisesRegex(Refused, message):
                    github_json("rules/branches/main", open_url)

    def source_runner(self, responses):
        class Fake:
            def text(self, args):
                if args[1:3] == ["remote", "get-url"]:
                    return "https://github.com/avshukan/rank-vote.git"
                if args[1] == "rev-parse":
                    return SHA
                return ""

            def run(self, args, **kwargs):
                assert args[0] != "gh", "the VPS no longer calls gh"
                return SimpleNamespace(returncode=1 if args[1] == "symbolic-ref" else 0)

            def github(self, path):
                return responses[path.split("?")[0]]
        return Fake()

    def responses(self):
        return {
            "actions/workflows/ci.yml/runs": {"workflow_runs": [
                {"id": 1, "head_sha": SHA, "head_branch": "main", "event": "push", "conclusion": "failure",
                 "path": ".github/workflows/ci.yml"},
                {"id": 2, "head_sha": SHA, "head_branch": "main", "event": "push", "conclusion": "success",
                 "path": ".github/workflows/ci.yml"}]},
            "actions/runs/2/jobs": {"jobs": [{"name": name, "conclusion": "success", "head_sha": SHA}
                                             for name in ("checks", "containers")]},
            "rules/branches/main": [{"type": "required_status_checks", "parameters": {
                "required_status_checks": [{"context": "checks"}, {"context": "containers"}]}}],
        }

    def test_check_source_keeps_its_checks_without_a_credential(self):
        check_source(self.source_runner(self.responses()), SHA)
        malformed = [("actions/workflows/ci.yml/runs", {"runs": []}),
                     ("actions/workflows/ci.yml/runs", {"workflow_runs": [{"no": "id"}]}),
                     ("actions/runs/2/jobs", {"jobs": "none"}),
                     ("actions/runs/2/jobs", {"jobs": [{"conclusion": "success"}]}),
                     ("rules/branches/main", {"rules": []}),
                     ("rules/branches/main", [{"type": "required_status_checks"}])]
        refused = [("actions/workflows/ci.yml/runs", {"workflow_runs": []}),
                   ("rules/branches/main", [{"type": "required_status_checks", "parameters": {
                       "required_status_checks": [{"context": "checks"}]}}])]
        for path, value in malformed + refused:
            with self.subTest(path=path, value=value):
                with self.assertRaises(Refused):
                    check_source(self.source_runner({**self.responses(), path: value}), SHA)

    def test_production_tooling_never_runs_gh(self):
        for path in (ROOT / "scripts/production").glob("*.py"):
            if path.name != "test_production.py":
                self.assertNotIn('"gh"', path.read_text(), path.name)


class ReleasePlanTests(unittest.TestCase):
    def plan(self, current, tag="v0.2.0", sha=CANDIDATE, ancestor=True):
        return release_plan(current, tag, sha, lambda older, newer: ancestor)

    def test_release_tag_is_strict_semver(self):
        for tag in ("v0.2.0", "v10.0.1", "v0.0.0"):
            validate_release_tag(tag)
        for tag in ("0.2.0", "v0.2", "v01.2.3", "v0.2.0-rc.1", "v0.2.0+1", "V0.2.0", " v0.2.0", "v0.2.0\n",
                    "v٠.2.0", None):
            with self.subTest(tag=tag), self.assertRaises(Refused):
                validate_release_tag(tag)

    def test_forward_release_of_a_descendant(self):
        self.assertEqual(self.plan(manifest(CURRENT, "v0.1.0")), "deploy")
        self.assertEqual(self.plan(manifest(CURRENT, "v0.1.0"), "v0.10.0"), "deploy")
        self.assertEqual(self.plan(manifest(CURRENT)), "deploy")

    def test_same_tag_and_sha_is_already_current(self):
        self.assertEqual(self.plan(manifest(CANDIDATE, "v0.2.0"), ancestor=False), "current")

    def test_refusals(self):
        cases = [
            (None, {}, "first deployment stays manual"),
            (manifest(CANDIDATE, "v0.1.0"), {}, "second release tag"),
            (manifest(CANDIDATE), {}, "second release tag"),
            (manifest(CURRENT, "v0.2.0"), {}, "tags never move"),
            (manifest(CURRENT, "v0.1.0"), {"ancestor": False}, "downgrade or divergent"),
            (manifest(CURRENT, "v0.3.0"), {}, "not greater"),
            (manifest(CURRENT, "v0.2.1"), {"tag": "v0.2.0"}, "not greater"),
        ]
        for current, options, message in cases:
            with self.subTest(message=message, current=current and current["RELEASE_TAG"]):
                with self.assertRaisesRegex(Refused, message):
                    self.plan(current, **options)


class LockHandoverTests(unittest.TestCase):
    def test_inherited_descriptor_keeps_the_lock_and_releases_it_once_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lock"
            other = "from scripts.production.core import deployment_lock; import sys\nwith deployment_lock(sys.argv[1]): pass"
            def other_operation():
                return subprocess.run(["python3", "-c", other, str(path)], cwd=ROOT, capture_output=True).returncode
            fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with inherited_lock(fd, path):
                self.assertNotEqual(other_operation(), 0)
            self.assertEqual(other_operation(), 0)

    def test_a_foreign_or_unlocked_descriptor_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lock"
            path.touch()
            elsewhere = os.open(Path(directory) / "other", os.O_CREAT | os.O_RDWR, 0o600)
            with self.assertRaisesRegex(Refused, "not the deployment lock"):
                with inherited_lock(elsewhere, path):
                    pass
            with deployment_lock(path):
                unlocked = os.open(path, os.O_RDWR)
                with self.assertRaisesRegex(Refused, "holds the deployment lock"):
                    with inherited_lock(unlocked, path):
                        pass


class ReleaseRunner:
    """A production host for the unattended release, recording every operation."""

    def __init__(self, tag_type="tag", tag_sha=CANDIDATE, ancestor=True, migration=0):
        self.config = {}
        self.tag_type, self.tag_sha, self.ancestor, self.migration = tag_type, tag_sha, ancestor, migration
        self.operations = []

    def text(self, args):
        if args[:2] == ["git", "cat-file"]:
            return self.tag_type
        if args[:2] == ["git", "rev-parse"]:
            return self.tag_sha
        raise AssertionError(args)

    def run(self, args, **kwargs):
        if args[:3] == ["git", "merge-base", "--is-ancestor"]:
            return SimpleNamespace(returncode=0 if self.ancestor else 1)
        raise AssertionError(args)

    def model(self, sha):
        self.operations.append(["model", sha])

    def compose(self, sha, args, **kwargs):
        self.operations.append(args)
        failed = "--exit-code-from" in args and self.migration
        return SimpleNamespace(returncode=1 if failed else 0, stdout="tool output", stderr="")


AUDIT = ["$ ss -lntup", "tcp LISTEN 0.0.0.0:22 sshd", "$ iptables -S", "-P INPUT DROP"]


class UnattendedReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.state_dir = Path(self.directory.name)
        state = ReleaseState(self.state_dir)
        state.write("previous", manifest("b" * 40, ""))
        state.write("current", {**manifest(CURRENT, "v0.1.0"), "SMOKE_POLL_ID": POLL})
        self.before = self.manifests()
        self.verified = []
        self.built = []

    def tearDown(self):
        self.directory.cleanup()

    def manifests(self):
        return {name: (self.state_dir / f"{name}.env").read_bytes() for name in ("current", "previous")}

    def release(self, runner=None, tag="v0.2.0", sha=CANDIDATE, build=None, public_check=None):
        runner = runner or ReleaseRunner()
        public = io.StringIO()
        images = {"api": ("rank-vote-api:" + sha, "sha256:" + "1" * 64),
                  "web": ("rank-vote-web:" + sha, "sha256:" + "2" * 64)}

        def prepare_images(*args):
            self.built.append(sha)
            if build:
                build()
            return images

        def verify(previous_poll):
            self.verified.append(previous_poll)
            if public_check:
                public_check()
            return NEW_POLL

        def preflight(*args):
            print("\n".join(AUDIT))

        def no_input(*args):
            raise AssertionError("the unattended release read input")
        with patch.object(unattended, "read_config", return_value=fresh_config()), \
             patch.object(unattended, "check_source"), \
             patch.object(unattended, "private_path"), \
             patch.object(unattended, "preflight", side_effect=preflight) as audit, \
             patch.object(unattended, "automated_public_verification", side_effect=verify), \
             patch("scripts.production.release.prepare_images", side_effect=prepare_images), \
             patch("scripts.production.release.verify_image_ids"), \
             patch("scripts.production.release.internal_verify"), \
             patch("builtins.input", side_effect=no_input), \
             patch.object(sys, "stdin", io.StringIO()):
            code = unattended.release(runner, tag, sha, self.state_dir, public)
        self.preflight_calls = audit.call_count
        self.runner = runner
        logs = list(self.state_dir.glob("release-*.log"))
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].stat().st_mode & 0o777, 0o600)
        return code, public.getvalue(), logs[0].read_text()

    def assert_unchanged(self):
        self.assertEqual(self.manifests(), self.before)

    def test_verified_release_promotes_with_its_tag_and_keeps_the_audit_private(self):
        code, public, diagnostics = self.release()
        self.assertEqual(code, 0)
        state = ReleaseState(self.state_dir)
        current = state.read("current")
        self.assertEqual((current["RELEASE_SHA"], current["RELEASE_TAG"], current["SMOKE_POLL_ID"]),
                         (CANDIDATE, "v0.2.0", NEW_POLL))
        self.assertEqual(state.read("previous"), {**manifest(CURRENT, "v0.1.0"), "SMOKE_POLL_ID": POLL})
        self.assertEqual(self.verified, [POLL])
        self.assertIn(f"Verified: v0.2.0 at {CANDIDATE} is the current release; smoke poll {NEW_POLL}", public)
        for line in AUDIT + ["tool output"]:
            self.assertNotIn(line, public)
        for line in AUDIT:
            self.assertIn(line, diagnostics)
        stages = [line for line in public.splitlines() if line in unattended.STAGES.values()]
        self.assertEqual(stages, [unattended.STAGES[name] for name in
                                  ("images", "stopping", "migrating", "starting", "verifying")])

    def test_already_current_release_deploys_and_writes_nothing(self):
        state = ReleaseState(self.state_dir)
        state.write("current", manifest(CANDIDATE, "v0.2.0"))
        self.before = self.manifests()
        code, public, _ = self.release(ReleaseRunner(ancestor=False))
        self.assertEqual(code, 0)
        self.assert_unchanged()
        self.assertEqual((self.built, self.verified, self.preflight_calls), ([], [], 0))
        self.assertEqual(self.runner.operations, [["model", CANDIDATE]])
        self.assertIn("Already current: v0.2.0", public)

    def test_refusals_before_any_change(self):
        cases = [
            ({"runner": ReleaseRunner(ancestor=False)}, "downgrade or divergent", "prepare a new release"),
            ({"tag": "v0.0.9"}, "not greater", "prepare a new release"),
            ({"runner": ReleaseRunner(tag_type="commit")}, "annotated tag", "re-run this workflow run"),
            ({"runner": ReleaseRunner(tag_sha="e" * 40)}, "annotated tag", "re-run this workflow run"),
        ]
        for options, reason, step in cases:
            with self.subTest(reason=reason, options=options):
                for log in self.state_dir.glob("release-*.log"):
                    log.unlink()
                code, public, _ = self.release(**options)
                self.assertEqual(code, 1)
                self.assertIn(reason, public)
                self.assertIn(unattended.UNCHANGED, public)
                self.assertIn(step, public)
                self.assert_unchanged()
                self.assertEqual(self.built, [])

    def test_build_failure_publishes_only_the_command_and_leaves_production_untouched(self):
        def build():
            raise CommandFailed("docker", 1, "raw build output with host details")
        code, public, diagnostics = self.release(build=build)
        self.assertEqual(code, 1)
        self.assertIn("Release failed: docker failed (exit 1)", public)
        self.assertIn(unattended.UNCHANGED, public)
        self.assertNotIn("raw build output", public)
        self.assertIn("raw build output", diagnostics)
        self.assertEqual(ReleaseState(self.state_dir).read("current")["RELEASE_SHA"], CURRENT)
        self.assertFalse(any(op[0] == "stop" for op in self.runner.operations if isinstance(op, list)))

    def test_migration_failure_reports_stopped_application(self):
        code, public, _ = self.release(ReleaseRunner(migration=1))
        self.assertEqual(code, 1)
        self.assertIn("Migration failed", public)
        self.assertIn("Web and API may be stopped", public)
        self.assertEqual(ReleaseState(self.state_dir).read("current")["RELEASE_SHA"], CURRENT)

    def test_failed_verification_keeps_the_verified_release_and_a_retry_keeps_the_rollback_target(self):
        def failing():
            raise Refused("Public API smoke failed: /health returned 502")
        code, public, _ = self.release(public_check=failing)
        self.assertEqual(code, 1)
        self.assertIn(f"current.env still names v0.1.0 at {CURRENT}", public)
        self.assertIn("make prod-rollback", public)
        state = ReleaseState(self.state_dir)
        verified = {**manifest(CURRENT, "v0.1.0"), "SMOKE_POLL_ID": POLL}
        self.assertEqual((state.read("current"), state.read("previous")), (verified, verified))
        for log in self.state_dir.glob("release-*.log"):
            log.unlink()
        code, _, _ = self.release()
        self.assertEqual(code, 0)
        self.assertEqual(state.read("previous"), verified)
        self.assertEqual(state.read("current")["RELEASE_TAG"], "v0.2.0")

    def test_missing_state_is_refused_before_anything_runs(self):
        with self.assertRaisesRegex(Refused, "first deployment stays manual"):
            unattended.release(ReleaseRunner(), "v0.2.0", CANDIDATE, self.state_dir / "missing", io.StringIO())
        with self.assertRaises(Refused):
            unattended.release(ReleaseRunner(), "v0.2", CANDIDATE, self.state_dir, io.StringIO())

    def test_deploy_reports_progress_and_records_the_release_tag(self):
        stages = []
        images = {"api": ("rank-vote-api:" + CANDIDATE, "sha256:" + "1" * 64),
                  "web": ("rank-vote-web:" + CANDIDATE, "sha256:" + "2" * 64)}
        with patch("scripts.production.release.prepare_images", return_value=images), \
             patch("scripts.production.release.verify_image_ids"), \
             patch("scripts.production.release.internal_verify"):
            candidate = deploy(ReleaseRunner(), ReleaseState(self.state_dir), CANDIDATE, lambda sha: NEW_POLL,
                               release_tag="v0.2.0", progress=stages.append)
        self.assertEqual(stages, ["images", "stopping", "migrating", "starting", "verifying"])
        self.assertEqual(candidate["RELEASE_TAG"], "v0.2.0")


class PreviousPollTests(unittest.TestCase):
    def check(self, poll, results):
        answers = {"/polls/" + POLL: poll, "/polls/" + POLL + "/results": results}
        with patch.object(probe, "json_request", side_effect=lambda path, origin: answers[path]):
            return probe.verify_previous_poll(POLL, "https://example.test")

    def test_tolerates_extra_ballots_but_requires_the_smoke_poll(self):
        poll = {"title": "Production smoke 123", "options": [{"text": t} for t in ("Alpha", "Beta", "Gamma")]}
        self.assertEqual(self.check(poll, {"totalBallots": 1}), POLL)
        self.assertEqual(self.check(poll, {"totalBallots": 7}), POLL)
        for changed, results in (({**poll, "title": "Other"}, {"totalBallots": 1}),
                                 ({**poll, "options": poll["options"][:2]}, {"totalBallots": 1}),
                                 ({"title": None}, {"totalBallots": 1}),
                                 (poll, {"totalBallots": 0}),
                                 (poll, {})):
            with self.subTest(poll=changed, results=results), self.assertRaises(Refused):
                self.check(changed, results)
        with self.assertRaises(Refused):
            probe.verify_previous_poll("not-a-poll")

    def test_automated_verification_runs_the_smoke_then_the_previous_poll(self):
        calls = []
        with patch.object(probe, "smoke", side_effect=lambda *args: calls.append("smoke") or NEW_POLL), \
             patch.object(probe, "verify_previous_poll", side_effect=lambda *args: calls.append(args)):
            self.assertEqual(probe.automated_public_verification(POLL, "https://example.test"), NEW_POLL)
        self.assertEqual(calls, ["smoke", (POLL, "https://example.test")])


class WrapperTests(unittest.TestCase):
    def setUp(self):
        self.wrapper = load_wrapper()
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        (self.root / "deploy-state").mkdir()
        self.lock = self.root / "lock"

    def tearDown(self):
        self.directory.cleanup()

    def git(self, overrides=None):
        answers = {"remote": "https://github.com/avshukan/rank-vote.git\n", "fetch": "", "cat-file": "tag\n",
                   "rev-parse": CANDIDATE + "\n", "merge-base": 0, "status": "", "switch": ""}
        answers.update(overrides or {})
        calls = []

        def run(root, *args):
            calls.append(args[0])
            answer = answers[args[0]]
            if isinstance(answer, int):
                return SimpleNamespace(returncode=answer, stdout="")
            if answer is None:
                return SimpleNamespace(returncode=128, stdout="")
            return SimpleNamespace(returncode=0, stdout=answer)
        return run, calls

    def main(self, command="v0.2.0 " + CANDIDATE, git=None, start=None, euid=0):
        out = io.StringIO()
        run, calls = git or self.git()

        def no_start(*args):
            raise AssertionError("release started")
        code = self.wrapper.main(environ={"SSH_ORIGINAL_COMMAND": command}, root=self.root, lock=self.lock,
                                 out=out, run=run, start=start or no_start, euid=lambda: euid, poll_seconds=0)
        return code, out.getvalue(), calls

    def test_only_a_release_tag_and_full_sha_are_accepted(self):
        self.assertEqual(self.wrapper.parse("v0.2.0 " + CANDIDATE), ("v0.2.0", CANDIDATE))
        for command in (None, "", "v0.2.0", CANDIDATE, f"v0.2.0  {CANDIDATE}", f" v0.2.0 {CANDIDATE}",
                        f"v0.2.0 {CANDIDATE} extra", f"v0.2.0 {CANDIDATE}\n", f"v0.2.0 {CANDIDATE[:39]}",
                        f"v0.2.0 {CANDIDATE.upper()}", f"v01.2.0 {CANDIDATE}", f"v0.2.0;id {CANDIDATE}",
                        f"$(id) {CANDIDATE}", f"v0.2.0 {CANDIDATE};id"):
            with self.subTest(command=command):
                code, out, calls = self.main(command)
                self.assertEqual(code, self.wrapper.USAGE)
                self.assertIn("refused", out)
                self.assertEqual(calls, [])

    def test_a_held_lock_refuses_before_touching_the_checkout(self):
        with deployment_lock(self.lock):
            code, out, calls = self.main()
        self.assertEqual(code, self.wrapper.BUSY)
        self.assertIn("holds the deployment lock", out)
        self.assertEqual(calls, [])

    def test_a_host_without_root_or_release_state_is_refused(self):
        self.assertEqual(self.main(euid=1000)[0], 1)
        (self.root / "deploy-state").rmdir()
        self.assertEqual(self.main()[0], 1)

    def test_checkout_verification_refuses_before_switching(self):
        cases = [({"remote": "git@github.com:avshukan/rank-vote.git\n"}, "origin must be"),
                 ({"fetch": None}, "git fetch failed"),
                 ({"cat-file": "commit\n"}, "not an annotated tag"),
                 ({"rev-parse": "e" * 40 + "\n"}, "does not point to"),
                 ({"merge-base": 1}, "is not on main"),
                 ({"merge-base": 128}, "could not check"),
                 ({"status": " M scripts/production/cli.py\n"}, "not clean")]
        for overrides, message in cases:
            with self.subTest(message=message):
                code, out, calls = self.main(git=self.git(overrides))
                self.assertEqual(code, 1)
                self.assertIn(message, out)
                self.assertIn("the running release is untouched", out)
                self.assertNotIn("switch", calls)

    def test_the_release_inherits_the_lock_and_outlives_the_wrapper(self):
        child = ("import fcntl, os, sys, time\n"
                 "fd = int(sys.argv[1])\n"
                 "fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)\n"
                 "print('Verified: status from the release', flush=True)\n"
                 "time.sleep(1.5)\n")
        started = []

        def start(root, tag, sha, fd, status_path):
            started.append((tag, sha))
            with open(status_path, "w") as status:
                return subprocess.Popen([sys.executable, "-c", child, str(fd)], stdout=status,
                                        pass_fds=(fd,), start_new_session=True)
        code, out, calls = self.main(start=start)
        self.assertEqual(code, 0)
        self.assertEqual(calls, ["remote", "fetch", "cat-file", "rev-parse", "merge-base", "status", "switch"])
        self.assertEqual(started, [("v0.2.0", CANDIDATE)])
        self.assertIn("Verified: status from the release", out)
        self.assertIn("continues on the VPS if this connection is lost", out)

    def test_the_lock_stays_held_while_the_started_release_runs(self):
        child = ("import fcntl, sys, time\n"
                 "fcntl.flock(int(sys.argv[1]), fcntl.LOCK_EX | fcntl.LOCK_NB)\n"
                 "time.sleep(3)\n")
        processes = []

        def start(root, tag, sha, fd, status_path):
            with open(status_path, "w") as status:
                process = subprocess.Popen([sys.executable, "-c", child, str(fd)], stdout=status,
                                           pass_fds=(fd,), start_new_session=True)
            processes.append(process)
            return SimpleNamespace(poll=lambda: 0, returncode=0)  # the caller stops following at once
        code, _, _ = self.main(start=start)
        self.assertEqual(code, 0)
        other = "from scripts.production.core import deployment_lock; import sys\nwith deployment_lock(sys.argv[1]): pass"
        self.assertNotEqual(subprocess.run(["python3", "-c", other, str(self.lock)], cwd=ROOT,
                                           capture_output=True).returncode, 0)
        processes[0].wait()
        self.assertEqual(subprocess.run(["python3", "-c", other, str(self.lock)], cwd=ROOT,
                                        capture_output=True).returncode, 0)

    def test_start_runs_the_cli_detached_with_a_clean_environment(self):
        status_path = self.root / "deploy-state" / "release.status"
        with patch.object(self.wrapper.subprocess, "Popen") as popen:
            self.wrapper.start_release(self.root, "v0.2.0", CANDIDATE, 7, status_path)
        args, kwargs = popen.call_args
        self.assertEqual(args[0], ["python3", "-m", "scripts.production.cli", "release", "--tag", "v0.2.0",
                                   "--sha", CANDIDATE, "--lock-fd", "7"])
        self.assertEqual((kwargs["pass_fds"], kwargs["start_new_session"], kwargs["stdin"]),
                         ((7,), True, subprocess.DEVNULL))
        self.assertEqual(kwargs["env"], self.wrapper.ENVIRONMENT)
        self.assertEqual(status_path.stat().st_mode & 0o777, 0o600)

    def test_a_lost_caller_stops_only_the_following(self):
        status_path = self.root / "status"
        status_path.write_text("line\n")

        class Gone(io.StringIO):
            def write(self, text):
                raise BrokenPipeError()
        process = Mock()
        process.poll.return_value = None
        self.assertEqual(self.wrapper.follow(status_path, process, Gone(), 0), 1)
        process.kill.assert_not_called()
        process.terminate.assert_not_called()

    def test_the_wrapper_never_imports_repository_code_and_fetches_without_credentials(self):
        source = (ROOT / "deploy/rank-vote-release").read_text()
        imports = [line for line in source.splitlines() if line.startswith(("import ", "from "))]
        self.assertFalse(any("scripts" in line for line in imports))
        for option in ("credential.helper=", "core.hooksPath=/dev/null", "protocol.allow=never"):
            self.assertIn(option, self.wrapper.GIT)
        self.assertTrue(os.access(ROOT / "deploy/rank-vote-release", os.X_OK))


if __name__ == "__main__":
    unittest.main()
