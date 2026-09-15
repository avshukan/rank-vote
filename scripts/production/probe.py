"""Public probes, run only during the later deployment phase (or isolated tests)."""

import argparse
import json
import re
import socket
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from .core import API_URL, HOST_IP, ORIGIN, require, validate_web_bundle


def request(url, body=None, headers=None):
    req = Request(url, data=json.dumps(body).encode() if body is not None else None,
                  headers={"Content-Type": "application/json", **(headers or {})})
    try:
        response = urlopen(req, timeout=20)  # Default CA/hostname validation; never disable TLS checks.
    except HTTPError as error:
        response = error
    with response:
        require(response.geturl() == url, "Unexpected redirect during public smoke")
        return response.status, response.read().decode(), dict(response.headers)


def json_request(path, body=None, expected=200, origin=ORIGIN):
    status, text, _ = request(origin + "/api/v1" + path, body)
    require(status == expected, f"Public API smoke failed: {path} returned {status}")
    return json.loads(text)


def verify_poll(poll_id, origin=ORIGIN):
    require(re.fullmatch(r"[0-9a-f-]{36}", poll_id), "Invalid smoke poll ID")
    poll = json_request("/polls/" + poll_id, origin=origin)
    results = json_request("/polls/" + poll_id + "/results", origin=origin)
    require(poll["title"].startswith("Production smoke ") and len(poll["options"]) == 3,
            "Unexpected smoke poll")
    expected = {option["id"]: 2 - index for index, option in enumerate(poll["options"])}
    require(results["totalBallots"] == 1 and results["method"] == "BORDA" and
            {score["optionId"]: score["score"] for score in results["scores"]} == expected and
            [winner["optionId"] for winner in results["winners"]] == [poll["options"][0]["id"]],
            "Persisted ballot/Borda result differs from expected 2/1/0")
    status, html, _ = request(origin + "/poll/" + poll_id + "/results")
    require(status == 200 and '<div id="root"></div>' in html, "Direct results route did not return the SPA")
    return poll_id


def smoke(origin=ORIGIN, expected_api_url=API_URL):
    require(json_request("/health", origin=origin) == {"status": "ok"}, "Unexpected health response")
    status, html, _ = request(origin + "/")
    require(status == 200 and '<div id="root"></div>' in html, "Frontend failed")
    assets = re.findall(r'src="(/assets/[^"?]+\.js)"', html)
    require(assets, "No frontend script found")
    bundle = "".join(request(origin + path)[1] for path in assets)
    validate_web_bundle(bundle, expected_api_url)
    poll = json_request("/polls", {"title": "Production smoke " + str(uuid4()),
                                 "options": ["Alpha", "Beta", "Gamma"]}, expected=201, origin=origin)
    # Print immediately so an interrupted smoke does not lose the poll ID.
    print("Smoke poll: " + poll["id"], flush=True)
    json_request("/polls/" + poll["id"] + "/ballots",
                 {"entries": [{"optionId": option["id"], "rank": index + 1}
                              for index, option in enumerate(poll["options"])]}, expected=201, origin=origin)
    return verify_poll(poll["id"], origin)


def proxy_probe(origin=ORIGIN):
    # Run from a dedicated external IP with a fresh bucket, before user smoke.
    # Vary XFF on each request: if any forged identity is used, request six will
    # wrongly pass. A second independent client proves buckets use the real peer.
    for index in range(7):
        status, _, headers = request(origin + "/api/v1/polls", {}, {
            "X-Forwarded-For": f"198.51.100.{index + 1}",
            "X-Real-IP": f"203.0.113.{index + 1}", "Forwarded": f"for=198.51.100.{index + 1}"})
        expected = 400 if index < 5 else 429
        require(status == expected, f"Proxy probe request {index + 1}: expected {expected}, got {status}")
        if expected == 429:
            require(any(key.lower() == "retry-after" and value.isdigit() for key, value in headers.items()),
                    "Missing Retry-After")
    print("Forged forwarding values did not bypass the bucket. Run peer-check from a SECOND public IP before resetting API.")


def peer_check():
    status, _, _ = request(API_URL + "/polls", {})
    require(status == 400, "Second public IP shares the exhausted bucket; proxy identity not proven")
    print("Independent peer has its own bucket. Restart the single API before user-flow smoke.")


def ports_closed(addresses):
    for address in addresses:
        for port in (3000, 5432):
            try:
                with socket.create_connection((address, port), timeout=3):
                    raise RuntimeError(f"Direct access unexpectedly open: {address}:{port}")
            except OSError:
                pass
    print("Direct API/PostgreSQL ports refused or timed out: " + ", ".join(addresses))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["flow", "persist", "proxy", "peer-check", "ports"])
    parser.add_argument("value", nargs="*")
    args = parser.parse_args()
    if args.action == "flow":
        smoke()
    elif args.action == "persist":
        require(len(args.value) == 1, "Supply the recorded smoke poll ID")
        verify_poll(args.value[0])
    elif args.action == "proxy":
        proxy_probe()
    elif args.action == "peer-check":
        peer_check()
    else:
        ports_closed([HOST_IP, *args.value])


if __name__ == "__main__":
    main()
