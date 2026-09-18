import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import quote

from .caddy import apply_route, candidate_config
from .cli import fresh_config
from .core import (API_URL, ORIGIN, VOLUME, Refused, ReleaseState, deployment_lock,
                   parse_env, private_path, redact, validate_ci, validate_config,
                   validate_manifest, validate_model, validate_sha, validate_web_bundle)
from .release import deploy, rollback, verify_image_ids
from .runtime import Runner, check_source, network_boundary

ROOT = Path(__file__).resolve().parents[2]
SHA = "a" * 40
POLL = "11111111-1111-4111-8111-111111111111"


def manifest(sha=SHA):
    return {"RELEASE_SHA": sha, "API_IMAGE": "rank-vote-api:" + sha,
            "WEB_IMAGE": "rank-vote-web:" + sha, "API_IMAGE_ID": "sha256:" + "1" * 64,
            "WEB_IMAGE_ID": "sha256:" + "2" * 64, "PRODUCTION_URL": ORIGIN,
            "DEPLOYED_AT": "2026-09-15T12:00:00Z", "RELEASE_TAG": "", "SMOKE_POLL_ID": POLL}


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
        with patch.dict(os.environ, {"DATABASE_URL": "private", "COMPOSE_FILE": "evil.yml"}):
            clean = Runner(self.config, root=ROOT)
            self.assertNotIn("DATABASE_URL", clean.environment)
            self.assertNotIn("COMPOSE_FILE", clean.environment)
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
            path.write_text(previous)
            operations = []
            class Fake:
                def run(self, args, input_text, **kwargs):
                    action = "reload" if "reload" in args else "validate"
                    operations.append((action, input_text))
                    if action == failure and input_text != previous:
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


if __name__ == "__main__":
    unittest.main()
