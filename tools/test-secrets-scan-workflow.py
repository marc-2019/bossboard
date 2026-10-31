#!/usr/bin/env python3
"""Regression checks for the gitleaks workflow.

Synthetic github-pat fixtures are assembled at runtime. This file must not
contain a contiguous token, and the harness must not print one.
"""

from __future__ import annotations

import base64
import bz2
import gzip
import io
import lzma
import os
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github" / "workflows" / "secrets-scan.yml"
OLD_REV = "14834983cc8178b04fd2d69a3b7cbfa4ae419c40"
# Head that still drops a preimage when its staged path collides, and
# still skips nonempty ar symbol-table members.
PREV_REV = "ef9ba3facc681b39f035cbfcb22ccc745570b510"
JWT_COMMIT = "9d2a49ebf8b5eaeba177a5c477ad123cf748f1d2"
JWT_FP = f"{JWT_COMMIT}:.claude/settings.local.json:jwt:25"
ZERO_SHA = "0" * 40
MAX_ARCHIVE = 32 * 1024 * 1024

_PARTS = (
    "ghp_",
    "FAKE",
    "fake",
    "FAKE",
    "fake",
    "FAKE",
    "fake",
    "FAKE",
    "fake",
    "1234",
)


def token_text() -> str:
    return "".join(_PARTS)


def token_bytes() -> bytes:
    return token_text().encode()


def assert_token_shape() -> None:
    text = token_text()
    if len(text) != 40 or not text.startswith("ghp_") or len(text) - 4 != 36:
        raise SystemExit("synthetic token has the wrong shape")
    if text.encode() in Path(__file__).read_bytes():
        raise SystemExit("synthetic token is contiguous in the test source")
    if text.encode() in WORKFLOW.read_bytes():
        raise SystemExit("synthetic token is contiguous in the workflow")


def redact(raw: bytes) -> str:
    text = raw.decode("utf-8", "replace")
    text = text.replace(token_text(), "[redacted]")
    out = []
    i = 0
    while True:
        j = text.find("eyJ", i)
        if j < 0:
            out.append(text[i:])
            break
        k = j + 3
        while k < len(text) and (
            text[k].isalnum() or text[k] in "-_"
        ):
            k += 1
        if k - j >= 20:
            out.append(text[i:j])
            out.append("[redacted-jwt]")
            i = k
        else:
            out.append(text[i : j + 3])
            i = j + 3
    return "".join(out)


def status_lines(text: str) -> str:
    kept = []
    for line in text.splitlines():
        if any(
            key in line
            for key in (
                "RuleID",
                "File:",
                "Commit:",
                "::error::",
                "archive scan failed",
                "materialized ",
                "secret scan",
                "leaks found",
                "INF",
                "WRN",
                "ERR",
                "no leaks",
            )
        ):
            if "Secret:" in line or "Finding:" in line or "Match:" in line:
                continue
            kept.append(line)
    return "\n".join(kept[:30])


def extract_run(text: str) -> str:
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if line.strip() != "- name: gitleaks":
            continue
        window = "\n".join(lines[i : i + 12])
        if "EVENT:" in window:
            start = i
            break
    if start is None:
        raise SystemExit("could not find the gitleaks step")
    body_at = None
    for j in range(start, min(start + 20, len(lines))):
        if lines[j].strip() == "run: |":
            body_at = j + 1
            break
    if body_at is None:
        raise SystemExit("could not find the gitleaks run block")
    indent = None
    for line in lines[body_at:]:
        if line.strip():
            indent = len(line) - len(line.lstrip(" "))
            break
    if not indent:
        raise SystemExit("gitleaks run block is empty")
    body = []
    for line in lines[body_at:]:
        if line.strip() == "":
            body.append("")
            continue
        if not line.startswith(" " * indent):
            break
        body.append(line[indent:])
    script = "\n".join(body).rstrip() + "\n"
    if "gitleaks detect" not in script or "SCAN_CONFIG" not in script:
        raise SystemExit("extracted gitleaks script is incomplete")
    return script


def run_git(args: list[str], cwd: str | None = None, data: bytes | None = None) -> str:
    proc = subprocess.run(
        ["git", *args],
        cwd=cwd,
        input=data,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        err = redact(proc.stderr + proc.stdout)
        shown = " ".join(arg for arg in args if token_text() not in arg)
        raise RuntimeError(f"git {shown} failed: {err}")
    return proc.stdout.decode().strip()


class Repo:
    def __init__(self) -> None:
        self.dir = tempfile.mkdtemp(prefix="secscan-")
        self.bare: str | None = None
        run_git(["init", "-q", "-b", "main", self.dir])
        run_git(["-C", self.dir, "config", "user.email", "dev@bossboard.test"])
        run_git(["-C", self.dir, "config", "user.name", "Tester"])
        run_git(["-C", self.dir, "config", "commit.gpgsign", "false"])
        run_git(["-C", self.dir, "config", "tag.gpgsign", "false"])
        self.commit({"README": b"hello\n"}, "initial")
        self.base = self.rev()

    def rev(self) -> str:
        return run_git(["-C", self.dir, "rev-parse", "HEAD"])

    def commit(
        self,
        files: dict[str, bytes],
        message: str,
        author: str | None = None,
        email: str | None = None,
    ) -> None:
        for rel, data in files.items():
            path = Path(self.dir) / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            run_git(["-C", self.dir, "add", "--", rel])
        cmd = ["-C", self.dir]
        if author is not None:
            cmd += ["-c", f"user.name={author}"]
        if email is not None:
            cmd += ["-c", f"user.email={email}"]
        cmd += ["commit", "-q", "-m", message]
        run_git(cmd)

    def push_env(self, **extra: str) -> dict[str, str]:
        env = {
            "EVENT": "push",
            "BASE_SHA": self.base,
            "HEAD_SHA": self.rev(),
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_REF_NAME": "main",
            "GITHUB_REF_TYPE": "branch",
            "GITHUB_HEAD_REF": "",
        }
        env.update(extra)
        return env

    def ensure_origin(self) -> None:
        if self.bare:
            return
        self.bare = tempfile.mkdtemp(prefix="secscan-bare-")
        run_git(["init", "--bare", "-q", self.bare])
        run_git(["-C", self.dir, "remote", "add", "origin", self.bare])

    def track(self, name: str, sha: str | None = None) -> None:
        run_git(["-C", self.dir, "update-ref", f"refs/remotes/origin/{name}", sha or self.rev()])

    def cleanup(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)
        if self.bare:
            shutil.rmtree(self.bare, ignore_errors=True)


def zip_bytes(name: str, payload: bytes) -> bytes:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(name, payload)
    return bio.getvalue()


def nest_zip(layers: int, inner: bytes, inner_name: str = "secret.txt") -> bytes:
    data = inner
    name = inner_name
    for i in range(layers):
        data = zip_bytes(name, data)
        name = f"layer{i}.zip"
    return data


def require_hidden(blob: bytes) -> bytes:
    if token_bytes() in blob:
        raise SystemExit("fixture is invalid: token is visible in the archive bytes")
    return blob


def lying_deflate_zip(member_name: str, payload: bytes, declared: int) -> bytes:
    """Zip whose uncompressed size and CRC describe only a short prefix.

    The deflate stream still expands to the full payload. ZipExtFile stops
    at the declared size, so a scanner that trusts that read misses the rest.
    """
    if declared < 0 or declared >= len(payload):
        raise SystemExit("lying zip fixture declared size is out of range")
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(member_name, payload)
    data = bytearray(bio.getvalue())
    crc = zlib.crc32(payload[:declared]) & 0xFFFFFFFF

    def patch(sig: bytes, crc_at: int, size_at: int) -> None:
        idx = data.find(sig)
        if idx < 0:
            raise SystemExit("lying zip fixture is missing a header")
        data[idx + crc_at : idx + crc_at + 4] = crc.to_bytes(4, "little")
        data[idx + size_at : idx + size_at + 4] = declared.to_bytes(4, "little")

    patch(b"PK\x03\x04", 14, 22)
    patch(b"PK\x01\x02", 16, 24)
    blob = bytes(data)
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        info = archive.infolist()[0]
        if info.file_size != declared:
            raise SystemExit("lying zip fixture did not patch the declared size")
        short = archive.read(info)
        if len(short) != declared:
            raise SystemExit("lying zip fixture short read is unexpected")
        if token_bytes() in short:
            raise SystemExit("fixture is invalid: token is inside the declared prefix")
        archive.fp.seek(info.header_offset)
        local = archive.fp.read(30)
        name_len = int.from_bytes(local[26:28], "little")
        extra_len = int.from_bytes(local[28:30], "little")
        archive.fp.seek(info.header_offset + 30 + name_len + extra_len)
        raw = archive.fp.read(info.compress_size)
    decoder = zlib.decompressobj(wbits=-15)
    inflated = decoder.decompress(raw, declared + 1)
    if len(inflated) <= declared or decoder.eof:
        raise SystemExit("lying zip fixture deflate stream does not continue")
    if len(blob) >= 32 * 1024 * 1024:
        raise SystemExit("lying zip fixture is larger than the compressed cap")
    return require_hidden(blob) if token_bytes() in payload else blob


def tiny_png() -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0)
    scan = zlib.compress(b"\x00\xff")
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", scan) + chunk(b"IEND", b"")


def tar_gz(name: str, payload: bytes) -> bytes:
    bio = io.BytesIO()
    with tarfile.open(fileobj=bio, mode="w") as archive:
        info = tarfile.TarInfo(name)
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
    return gzip.compress(bio.getvalue())


def zeros(n: int) -> bytes:
    return b"\0" * n


SEVEN_Z = b"7z\xbc\xaf'\x1c" + b"\x00" * 32
RAR = b"Rar!\x1a\x07\x00" + b"\x00" * 32
ZSTD = b"\x28\xb5\x2f\xfd" + b"\x00" * 16


def base_child_env(extra: dict[str, str]) -> dict[str, str]:
    env = os.environ.copy()
    for key in ("GITLEAKS_CONFIG", "GITLEAKS_CONFIG_TOML"):
        env.pop(key, None)
    env.update(extra)
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def run_scan(script: str, repo: str, extra_env: dict[str, str], timeout: int) -> tuple[int, str, float]:
    path = tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False)
    path.write(script)
    path.close()
    os.chmod(path.name, 0o700)
    start = time.monotonic()
    try:
        proc = subprocess.run(
            ["bash", path.name],
            cwd=repo,
            env=base_child_env(extra_env),
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raw = (exc.stdout or b"") + (exc.stderr or b"")
        if token_bytes() in raw:
            raise SystemExit("token appeared in timed-out scan output") from exc
        return -1, redact(raw), time.monotonic() - start
    finally:
        os.unlink(path.name)
    raw = proc.stdout + proc.stderr
    if token_bytes() in raw:
        raise SystemExit("token appeared in scan output")
    return proc.returncode, redact(raw), time.monotonic() - start


def check_static() -> None:
    text = WORKFLOW.read_text()
    assert_token_shape()
    required = [
        "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
        "e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf",
        "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
        "contents: read",
        "v8.30.1",
        JWT_FP,
        "[[allowlists]]",
        "^AKIAIOSFODNN7EXAMPLF$",
        "^69a6de88-9efd-47e3-e053-5b8c7c11a4d1$",
    ]
    for item in required:
        if item not in text:
            raise SystemExit(f"workflow is missing a required pin or marker: {item}")
    if "eyJ" in text:
        raise SystemExit("workflow contains a JWT-looking literal")
    if text.count(JWT_FP) != 1:
        raise SystemExit(f"JWT fingerprint appears {text.count(JWT_FP)} times; expected 1")
    block = text.split('description = "Exact false-positive literals"', 1)[-1]
    block = block.split('"""', 1)[0]
    if "paths" in block:
        raise SystemExit("exact-value allowlist block sets paths")


def prepare_secret_file(name: str, blob: bytes, hidden: bool = True) -> tuple[Repo, dict[str, str]]:
    if hidden:
        require_hidden(blob)
    repo = Repo()
    repo.commit({name: blob}, "add fixture")
    return repo, repo.push_env()


def case_clean_zip() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.zip", zip_bytes("hello.txt", b"hello\n"), hidden=False)


def case_clean_gz() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.gz", gzip.compress(b"hello\n"), hidden=False)


def case_clean_png() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.png", tiny_png(), hidden=False)


def case_clean_push() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"README": b"hello again\n"}, "docs")
    return repo, repo.push_env()


def case_zip_bin() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", require_hidden(zip_bytes("secret.txt", token_bytes())))


def case_zip_png() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.png", require_hidden(zip_bytes("secret.txt", token_bytes())))


def case_zip_inner_bin() -> tuple[Repo, dict[str, str]]:
    inner = zip_bytes("secret.txt", token_bytes())
    return prepare_secret_file("notes.zip", require_hidden(zip_bytes("inner.bin", inner)))


def case_gz_bin() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", require_hidden(gzip.compress(token_bytes())))


def case_gz_of_zip() -> tuple[Repo, dict[str, str]]:
    inner = zip_bytes("secret.txt", token_bytes())
    return prepare_secret_file("notes.gz", require_hidden(gzip.compress(inner)))


def case_bz2_png() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.png", require_hidden(bz2.compress(token_bytes())))


def case_xz_bin() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", require_hidden(lzma.compress(token_bytes())))


def case_zeros_gz() -> tuple[Repo, dict[str, str]]:
    blob = gzip.compress(zeros(33 * 1024 * 1024), compresslevel=1)
    if len(blob) >= MAX_ARCHIVE:
        raise SystemExit("zero gzip fixture is larger than the compressed cap")
    return prepare_secret_file("notes.gz", blob, hidden=False)


def case_zeros_bz2() -> tuple[Repo, dict[str, str]]:
    blob = bz2.compress(zeros(33 * 1024 * 1024), compresslevel=1)
    return prepare_secret_file("notes.bz2", blob, hidden=False)


def case_zeros_xz() -> tuple[Repo, dict[str, str]]:
    blob = lzma.compress(zeros(33 * 1024 * 1024))
    return prepare_secret_file("notes.xz", blob, hidden=False)


def case_seven_z() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", SEVEN_Z, hidden=False)


def case_rar() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", RAR, hidden=False)


def case_zstd() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", ZSTD, hidden=False)


def case_zip_of_rar() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.zip", zip_bytes("inner.rar", RAR), hidden=False)


def case_deep_rar() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.zip", nest_zip(8, RAR, "inner.rar"), hidden=False)


def case_oversize_zip() -> tuple[Repo, dict[str, str]]:
    blob = zip_bytes("big.bin", zeros(33 * 1024 * 1024))
    if len(blob) >= MAX_ARCHIVE:
        raise SystemExit("oversize zip fixture is not a small compressed blob")
    return prepare_secret_file("notes.zip", blob, hidden=False)


def case_too_many_members() -> tuple[Repo, dict[str, str]]:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
        for i in range(2001):
            archive.writestr(f"m{i}.txt", b"a")
    return prepare_secret_file("notes.zip", bio.getvalue(), hidden=False)


def case_member_boundary() -> tuple[Repo, dict[str, str]]:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
        for i in range(2000):
            archive.writestr(f"m{i}.txt", b"a")
    return prepare_secret_file("notes.zip", bio.getvalue(), hidden=False)


def case_nested_4() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.zip", require_hidden(nest_zip(4, token_bytes())))


def case_nested_9() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.zip", require_hidden(nest_zip(9, token_bytes())))


def case_ignore_dir_zip() -> tuple[Repo, dict[str, str]]:
    blob = require_hidden(zip_bytes("secret.txt", token_bytes()))
    return prepare_secret_file(".gitleaksignore/notes.zip", blob)


def case_raw_png() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.png", token_bytes() + b"\n", hidden=False)


def case_raw_pdf() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.pdf", token_bytes() + b"\n", hidden=False)


def case_raw_bin() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", token_bytes() + b"\n", hidden=False)


def case_tar_gz() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.tar.gz", require_hidden(tar_gz("secret.txt", token_bytes())))


def case_clean_tar_gz() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.tar.gz", tar_gz("hello.txt", b"hello\n"), hidden=False)


def case_message_only() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"README": b"hello again\n"}, token_text())
    return repo, repo.push_env()


def case_author_only() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"README": b"hello again\n"}, "docs", author=token_text())
    return repo, repo.push_env()


def case_committer_email() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"README": b"hello again\n"}, "docs", email=token_text())
    return repo, repo.push_env()


def case_hostile_config_message() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    toml = (
        b"[extend]\nuseDefault = false\n\n[allowlist]\n"
        b"paths = ['''.*''']\nregexes = ['''.*''']\n"
    )
    repo.commit({".gitleaks.toml": toml, "README": b"hello again\n"}, token_text())
    return repo, repo.push_env()


def case_token_in_toml() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    toml = b"[extend]\nuseDefault = false\n\n" + token_bytes() + b"\n"
    repo.commit({".gitleaks.toml": toml}, "add config")
    return repo, repo.push_env()


def case_allow_comment() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"secret.txt": token_bytes() + b" # gitleaks:allow\n"}, "add note")
    return repo, repo.push_env()


def case_binary_attr() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit(
        {".gitattributes": b"secret.txt binary\n", "secret.txt": token_bytes() + b"\n"},
        "add note",
    )
    return repo, repo.push_env()


def case_ignore_fingerprint() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"secret.txt": token_bytes() + b"\n"}, "add note")
    sha = repo.rev()
    repo.commit({".gitleaksignore": f"{sha}:secret.txt:github-pat:1\n".encode()}, "ignore")
    return repo, repo.push_env()


def case_ignore_dir_file() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({".gitleaksignore/secret.txt": token_bytes() + b"\n"}, "add note")
    return repo, repo.push_env()


def case_ref_name() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    env = repo.push_env(
        GITHUB_REF=f"refs/heads/{token_text()}",
        GITHUB_REF_NAME=token_text(),
        BASE_SHA=repo.rev(),
    )
    return repo, env


def case_tag_name() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    env = repo.push_env(
        EVENT="push",
        GITHUB_REF=f"refs/tags/{token_text()}",
        GITHUB_REF_NAME=token_text(),
        GITHUB_REF_TYPE="tag",
        BASE_SHA=repo.rev(),
    )
    return repo, env


def case_clean_branch_on_main() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.ensure_origin()
    run_git(["-C", repo.dir, "push", "-q", "origin", "HEAD:refs/heads/main"])
    repo.track("main")
    run_git(["-C", repo.dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"])
    run_git(["-C", repo.dir, "branch", "feature-clean-tip"])
    repo.track("feature-clean-tip")
    run_git(["-C", repo.dir, "checkout", "-q", "feature-clean-tip"])
    env = repo.push_env(
        BASE_SHA=ZERO_SHA,
        GITHUB_REF="refs/heads/feature-clean-tip",
        GITHUB_REF_NAME="feature-clean-tip",
    )
    return repo, env


def case_two_new_refs() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    clean = repo.rev()
    repo.commit({"secret.txt": token_bytes() + b"\n"}, "add note")
    repo.ensure_origin()
    run_git(["-C", repo.dir, "push", "-q", "origin", f"{clean}:refs/heads/main"])
    repo.track("main", clean)
    run_git(["-C", repo.dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"])
    run_git(["-C", repo.dir, "branch", "topic-a"])
    run_git(["-C", repo.dir, "branch", "topic-b"])
    repo.track("topic-a")
    repo.track("topic-b")
    run_git(["-C", repo.dir, "checkout", "-q", "topic-a"])
    env = repo.push_env(
        BASE_SHA=ZERO_SHA,
        GITHUB_REF="refs/heads/topic-a",
        GITHUB_REF_NAME="topic-a",
    )
    return repo, env


def case_clean_tag() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.ensure_origin()
    run_git(["-C", repo.dir, "tag", "clean-tag-v1"])
    run_git(["-C", repo.dir, "push", "-q", "origin", "HEAD:refs/heads/main"])
    run_git(["-C", repo.dir, "push", "-q", "origin", "tag", "clean-tag-v1"])
    repo.track("main")
    run_git(["-C", repo.dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"])
    env = repo.push_env(
        BASE_SHA=ZERO_SHA,
        GITHUB_REF="refs/tags/clean-tag-v1",
        GITHUB_REF_NAME="clean-tag-v1",
        GITHUB_REF_TYPE="tag",
    )
    return repo, env


def case_tagger_name() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.ensure_origin()
    run_git(
        [
            "-C",
            repo.dir,
            "-c",
            f"user.name={token_text()}",
            "-c",
            "user.email=dev@bossboard.test",
            "tag",
            "-a",
            "annot-tagger",
            "HEAD",
            "-m",
            "release",
        ]
    )
    run_git(["-C", repo.dir, "push", "-q", "origin", "HEAD:refs/heads/main"])
    run_git(["-C", repo.dir, "push", "-q", "origin", "tag", "annot-tagger"])
    repo.track("main")
    run_git(["-C", repo.dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"])
    env = repo.push_env(
        BASE_SHA=ZERO_SHA,
        GITHUB_REF="refs/tags/annot-tagger",
        GITHUB_REF_NAME="annot-tagger",
        GITHUB_REF_TYPE="tag",
    )
    return repo, env


def annotated_blob_tag(payload: bytes, name: str) -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.ensure_origin()
    sha = run_git(["-C", repo.dir, "hash-object", "-w", "--stdin"], data=payload)
    # git tag -a accepts a blob. Fall back to mktag if this git refuses it.
    proc = subprocess.run(
        ["git", "-C", repo.dir, "tag", "-a", name, sha, "-m", "blob tag"],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        tagger = b"Tester <dev@bossboard.test> 1000000000 +0000"
        body = (
            b"object " + sha.encode() + b"\n"
            b"type blob\n"
            b"tag " + name.encode() + b"\n"
            b"tagger " + tagger + b"\n\nblob tag\n"
        )
        tag_sha = run_git(["-C", repo.dir, "mktag"], data=body)
        run_git(["-C", repo.dir, "update-ref", f"refs/tags/{name}", tag_sha])
    run_git(["-C", repo.dir, "push", "-q", "origin", "HEAD:refs/heads/main"])
    run_git(["-C", repo.dir, "push", "-q", "origin", "tag", name])
    repo.track("main")
    run_git(["-C", repo.dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"])
    env = repo.push_env(
        BASE_SHA=ZERO_SHA,
        GITHUB_REF=f"refs/tags/{name}",
        GITHUB_REF_NAME=name,
        GITHUB_REF_TYPE="tag",
    )
    return repo, env


def case_blob_tag() -> tuple[Repo, dict[str, str]]:
    return annotated_blob_tag(token_bytes() + b"\n", "annot-blob")


def case_clean_blob_tag() -> tuple[Repo, dict[str, str]]:
    return annotated_blob_tag(b"hello\n", "annot-clean-blob")


def case_type_change() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"other.txt": b"clean\n"}, "add other")
    link = Path(repo.dir) / "secret.txt"
    link.symlink_to("other.txt")
    run_git(["-C", repo.dir, "add", "--", "secret.txt"])
    run_git(["-C", repo.dir, "commit", "-q", "-m", "add link"])
    link.unlink()
    link.write_bytes(token_bytes() + b"\n")
    run_git(["-C", repo.dir, "add", "--", "secret.txt"])
    run_git(["-C", repo.dir, "commit", "-q", "-m", "replace link"])
    repo.ensure_origin()
    run_git(["-C", repo.dir, "push", "-q", "origin", "HEAD:refs/heads/main"])
    env = repo.push_env(EVENT="workflow_dispatch", GITHUB_REF="refs/heads/main", GITHUB_REF_NAME="main")
    return repo, env


def case_pr_png() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"notes.png": token_bytes() + b"\n"}, "add png")
    env = repo.push_env(EVENT="pull_request", HEAD_SHA=repo.rev())
    return repo, env


def case_exact_akia() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"tools/key.txt": b"AKIAIOSFODNN7EXAMPLF\n"}, "add key")
    return repo, repo.push_env()


def case_akia_plus_token() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit(
        {"tools/key.txt": b"AKIAIOSFODNN7EXAMPLF\n" + token_bytes() + b"\n"},
        "add key",
    )
    return repo, repo.push_env()


def case_other_akia() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    # Split so the source of this harness is not itself a finding.
    other = "AKIA" + "IOSFODNN7EXAMPLA"
    repo.commit({"tools/key.txt": (other + "\n").encode()}, "add key")
    return repo, repo.push_env()


def case_issuer() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"apps/mobile/eas.json": b"69a6de88-9efd-47e3-e053-5b8c7c11a4d1\n"}, "add id")
    return repo, repo.push_env()


def case_nul_prefixed(kind: str, name: str) -> tuple[Repo, dict[str, str]]:
    if kind == "gzip":
        body = gzip.compress(token_bytes())
    elif kind == "zip":
        body = zip_bytes("secret.txt", token_bytes())
    else:
        raise SystemExit("unknown nul fixture")
    blob = b"\x00" + body
    if not (blob[1:3] == b"\x1f\x8b" or blob[1:5] == b"PK\x03\x04"):
        raise SystemExit("nul fixture magic is not at offset 1")
    return prepare_secret_file(name, require_hidden(blob))


def case_lying_token(name: str) -> tuple[Repo, dict[str, str]]:
    payload = b"A" * 8000 + token_bytes() + b"B" * 8000
    blob = lying_deflate_zip("secret.txt", payload, 64)
    if token_bytes() in blob:
        raise SystemExit("fixture is invalid: token is visible in the archive bytes")
    return prepare_secret_file(name, blob)


def case_lying_zero(name: str) -> tuple[Repo, dict[str, str]]:
    payload = b"\x00" * (40 * 1024 * 1024)
    blob = lying_deflate_zip("big.bin", payload, 128)
    return prepare_secret_file(name, blob, hidden=False)


def assert_zip_hello(blob: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if archive.read(archive.infolist()[0]) != b"hello\n":
            raise SystemExit("zip fixture member body changed")
    return require_hidden(blob)


def case_trail_after(kind: str) -> tuple[Repo, dict[str, str]]:
    payload = zip_bytes("secret.txt", token_bytes())
    if kind == "bz2":
        blob = bz2.compress(b"hello") + payload
    elif kind == "xz":
        blob = lzma.compress(b"hello") + payload
    elif kind == "gzip":
        blob = gzip.compress(b"hello") + payload
    else:
        raise SystemExit("unknown trailing-stream fixture")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_zip_comment() -> tuple[Repo, dict[str, str]]:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("hello.txt", b"hello\n")
        archive.comment = gzip.compress(token_bytes())
    blob = bio.getvalue()
    if gzip.decompress(zipfile.ZipFile(io.BytesIO(blob)).comment) != token_bytes():
        raise SystemExit("zip comment fixture did not keep the compressed token")
    return prepare_secret_file("notes.bin", assert_zip_hello(blob))


def case_zip_gap() -> tuple[Repo, dict[str, str]]:
    raw = zip_bytes("hello.txt", b"hello\n")
    eocd = raw.rfind(b"PK\x05\x06")
    cd_off = int.from_bytes(raw[eocd + 16 : eocd + 20], "little")
    gap = gzip.compress(token_bytes())
    blob = bytearray(raw[:cd_off] + gap + raw[cd_off:])
    moved = eocd + len(gap)
    blob[moved + 16 : moved + 20] = (cd_off + len(gap)).to_bytes(4, "little")
    return prepare_secret_file("notes.bin", assert_zip_hello(bytes(blob)))


def case_zip_after_eocd() -> tuple[Repo, dict[str, str]]:
    blob = zip_bytes("hello.txt", b"hello\n") + gzip.compress(token_bytes())
    return prepare_secret_file("notes.bin", assert_zip_hello(blob))


def gzip_tar(build) -> bytes:
    bio = io.BytesIO()
    with tarfile.open(fileobj=bio, mode="w") as archive:
        build(archive)
    blob = gzip.compress(bio.getvalue())
    return require_hidden(blob)


def case_tar_tail() -> tuple[Repo, dict[str, str]]:
    bio = io.BytesIO()
    with tarfile.open(fileobj=bio, mode="w") as archive:
        info = tarfile.TarInfo("hello.txt")
        info.size = 6
        archive.addfile(info, io.BytesIO(b"hello\n"))
    blob = gzip.compress(bio.getvalue() + gzip.compress(token_bytes()))
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_tar_name() -> tuple[Repo, dict[str, str]]:
    def build(archive: tarfile.TarFile) -> None:
        info = tarfile.TarInfo(token_text())
        info.size = 6
        archive.addfile(info, io.BytesIO(b"hello\n"))

    return prepare_secret_file("notes.bin", gzip_tar(build))


def case_tar_link() -> tuple[Repo, dict[str, str]]:
    def build(archive: tarfile.TarFile) -> None:
        info = tarfile.TarInfo("link")
        info.type = tarfile.SYMTYPE
        info.linkname = token_text()
        archive.addfile(info)

    return prepare_secret_file("notes.bin", gzip_tar(build))


def case_tar_pax() -> tuple[Repo, dict[str, str]]:
    def build(archive: tarfile.TarFile) -> None:
        info = tarfile.TarInfo("hello.txt")
        info.size = 6
        info.pax_headers = {"BOSSBOARD": token_text()}
        archive.addfile(info, io.BytesIO(b"hello\n"))

    return prepare_secret_file("notes.bin", gzip_tar(build))


def case_over_cap_suffix() -> tuple[Repo, dict[str, str]]:
    suffix = gzip.compress(token_bytes())
    blob = b"A" * (MAX_ARCHIVE + 1) + suffix
    if len(blob) <= MAX_ARCHIVE:
        raise SystemExit("over-cap fixture is not larger than the window")
    if b"\x1f\x8b" in blob[: MAX_ARCHIVE + 1]:
        raise SystemExit("over-cap fixture signature is inside the prefix window")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def gzip_with_extra(extra: bytes, payload: bytes) -> bytes:
    comp = zlib.compress(payload)[2:-4]
    crc = zlib.crc32(payload) & 0xFFFFFFFF
    header = bytes([0x1F, 0x8B, 0x08, 0x04, 0, 0, 0, 0, 0, 255])
    return (
        header
        + len(extra).to_bytes(2, "little")
        + extra
        + comp
        + crc.to_bytes(4, "little")
        + (len(payload) & 0xFFFFFFFF).to_bytes(4, "little")
    )


def case_tar_pad() -> tuple[Repo, dict[str, str]]:
    bio = io.BytesIO()
    with tarfile.open(fileobj=bio, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        info = tarfile.TarInfo("hello.txt")
        info.size = 6
        archive.addfile(info, io.BytesIO(b"hello\n"))
    raw = bytearray(bio.getvalue())
    with tarfile.open(fileobj=io.BytesIO(bytes(raw)), mode="r:") as archive:
        member = archive.getmembers()[0]
    pad = gzip.compress(token_bytes())
    start = member.offset_data + member.size
    if start + len(pad) > member.offset_data + 512:
        raise SystemExit("tar padding fixture does not fit in one block")
    raw[start : start + len(pad)] = pad
    return prepare_secret_file("notes.bin", require_hidden(bytes(raw)))


def case_zip_file_comment() -> tuple[Repo, dict[str, str]]:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
        info = zipfile.ZipInfo("hello.txt")
        info.compress_type = zipfile.ZIP_STORED
        info.comment = gzip.compress(token_bytes())
        archive.writestr(info, b"hello\n")
    blob = bio.getvalue()
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if archive.infolist()[0].comment[:2] != b"\x1f\x8b":
            raise SystemExit("zip file-comment fixture lost the gzip comment")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_zip_local_extra() -> tuple[Repo, dict[str, str]]:
    payload = gzip.compress(token_bytes())
    extra = b"\x99\x99" + len(payload).to_bytes(2, "little") + payload
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
        info = zipfile.ZipInfo("hello.txt")
        info.compress_type = zipfile.ZIP_STORED
        info.extra = extra
        archive.writestr(info, b"hello\n")
    blob = bio.getvalue()
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        info = archive.infolist()[0]
        archive.fp.seek(info.header_offset)
        local = archive.fp.read(30)
        name_len = int.from_bytes(local[26:28], "little")
        extra_len = int.from_bytes(local[28:30], "little")
        archive.fp.seek(info.header_offset + 30 + name_len)
        local_extra = archive.fp.read(extra_len)
        if payload not in local_extra or payload not in info.extra:
            raise SystemExit("zip extra fixture is not in the local and central headers")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_gzip_fextra() -> tuple[Repo, dict[str, str]]:
    blob = gzip_with_extra(gzip.compress(token_bytes()), b"hello\n")
    if gzip.decompress(blob) != b"hello\n":
        raise SystemExit("gzip FEXTRA fixture does not inflate")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def hash_blob(repo: Repo, data: bytes) -> str:
    return run_git(["-C", repo.dir, "hash-object", "-w", "--stdin"], data=data)


def mktree(repo: Repo, entries: list[tuple[str, str, str, str]]) -> str:
    chunks = [f"{mode} {kind} {sha}\t{path}\0".encode() for mode, kind, sha, path in entries]
    return run_git(["-C", repo.dir, "mktree", "-z"], data=b"".join(chunks))


def commit_tree(repo: Repo, tree: str, message: str) -> None:
    parent = repo.rev()
    sha = run_git(["-C", repo.dir, "commit-tree", tree, "-p", parent, "-m", message])
    run_git(["-C", repo.dir, "update-ref", "HEAD", sha])


def case_path_backslash() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    sha = hash_blob(repo, require_hidden(gzip.compress(token_bytes())))
    tree = mktree(repo, [("100644", "blob", sha, "foo\\..\\secret.bin")])
    commit_tree(repo, tree, "add odd path")
    return repo, repo.push_env()


def case_path_dotdot() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    sha = hash_blob(repo, require_hidden(gzip.compress(token_bytes())))
    inner = mktree(repo, [("100644", "blob", sha, "..")])
    tree = mktree(repo, [("040000", "tree", inner, "foo")])
    commit_tree(repo, tree, "add dotdot path")
    return repo, repo.push_env()


def case_zlib_raw() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", require_hidden(zlib.compress(token_bytes())))


def case_zlib_stored_zip() -> tuple[Repo, dict[str, str]]:
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("secret.bin", zlib.compress(token_bytes()))
    return prepare_secret_file("notes.bin", require_hidden(bio.getvalue()))


def newc_cpio(name: str, payload: bytes) -> bytes:
    def one(name_b: bytes, body: bytes) -> bytes:
        def field(value: int) -> bytes:
            return f"{value:08X}".encode()

        header = b"".join(
            [
                b"070701",
                field(1),
                field(0o100644),
                field(0),
                field(0),
                field(1),
                field(0),
                field(len(body)),
                field(0),
                field(0),
                field(0),
                field(0),
                field(len(name_b)),
                field(0),
            ]
        )
        if len(header) != 110:
            raise SystemExit("cpio header is the wrong size")
        name_end = 110 + len(name_b)
        data_off = (name_end + 3) & ~3
        data_end = data_off + len(body)
        pad_end = (data_end + 3) & ~3
        return (
            header
            + name_b
            + b"\x00" * (data_off - name_end)
            + body
            + b"\x00" * (pad_end - data_end)
        )

    return one(name.encode() + b"\x00", payload) + one(b"TRAILER!!!\x00", b"")


def case_zlib_cpio() -> tuple[Repo, dict[str, str]]:
    blob = newc_cpio("secret.bin", zlib.compress(token_bytes()))
    if not blob.startswith(b"070701"):
        raise SystemExit("cpio fixture magic is wrong")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_lzma_alone() -> tuple[Repo, dict[str, str]]:
    blob = lzma.compress(token_bytes(), format=lzma.FORMAT_ALONE)
    if not blob.startswith(b"\x5d\x00\x00\x80\x00"):
        raise SystemExit("lzma-alone fixture header changed")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_b64_gzip() -> tuple[Repo, dict[str, str]]:
    blob = base64.b64encode(gzip.compress(token_bytes()))
    if len(blob) < 40 or len(blob) % 4:
        raise SystemExit("base64 fixture is the wrong shape")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_tag_gzip_blob() -> tuple[Repo, dict[str, str]]:
    return annotated_blob_tag(require_hidden(gzip.compress(token_bytes())), "annot-gzip-blob")


def case_deleted_secret() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"notes.txt": token_bytes() + b"\n"}, "add notes")
    repo.base = repo.rev()
    (Path(repo.dir) / "notes.txt").unlink()
    run_git(["-C", repo.dir, "add", "-u"])
    run_git(["-C", repo.dir, "commit", "-q", "-m", "remove notes"])
    return repo, repo.push_env()


def _commit_gitlink(repo: Repo) -> None:
    """Stage a mode-160000 entry whose target is a commit, not a blob."""
    link = repo.rev()
    run_git(
        [
            "-C",
            repo.dir,
            "update-index",
            "--add",
            "--cacheinfo",
            f"160000,{link},vendor/lib",
        ]
    )
    run_git(["-C", repo.dir, "commit", "-q", "-m", "add gitlink"])


def _delete_gitlink(repo: Repo) -> None:
    run_git(["-C", repo.dir, "rm", "--cached", "-q", "--", "vendor/lib"])


def case_deleted_gitlink() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    _commit_gitlink(repo)
    repo.base = repo.rev()
    _delete_gitlink(repo)
    run_git(["-C", repo.dir, "commit", "-q", "-m", "remove gitlink"])
    shown = run_git(
        ["-C", repo.dir, "diff-tree", "-r", "--root", "--diff-filter=D", "HEAD"]
    )
    if "160000" not in shown:
        raise SystemExit("deleted gitlink fixture has no mode 160000")
    return repo, repo.push_env()


def case_deleted_gitlink_secret() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"notes.txt": token_bytes() + b"\n"}, "add notes")
    _commit_gitlink(repo)
    repo.base = repo.rev()
    _delete_gitlink(repo)
    (Path(repo.dir) / "notes.txt").unlink()
    run_git(["-C", repo.dir, "add", "-u"])
    run_git(["-C", repo.dir, "commit", "-q", "-m", "remove notes and gitlink"])
    shown = run_git(
        ["-C", repo.dir, "diff-tree", "-r", "--root", "--diff-filter=D", "HEAD"]
    )
    if "160000" not in shown:
        raise SystemExit("deleted gitlink fixture has no mode 160000")
    return repo, repo.push_env()


def case_global_members() -> tuple[Repo, dict[str, str]]:
    inners = []
    for i in range(100):
        bio = io.BytesIO()
        with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
            for j in range(100):
                archive.writestr(f"{j}.txt", b"a")
        inners.append(bio.getvalue())
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
        for i, raw in enumerate(inners):
            archive.writestr(f"{i}.zip", raw)
    blob = bio.getvalue()
    if len(blob) >= MAX_ARCHIVE:
        raise SystemExit("global member fixture is larger than the file cap")
    return prepare_secret_file("notes.bin", blob, hidden=False)


def case_global_bytes() -> tuple[Repo, dict[str, str]]:
    part = gzip.compress(b"\x00" * (20 * 1024 * 1024), compresslevel=1)
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("a.bin", part)
        archive.writestr("b.bin", part)
    blob = bio.getvalue()
    if len(blob) >= MAX_ARCHIVE:
        raise SystemExit("global byte fixture is larger than the file cap")
    return prepare_secret_file("notes.bin", blob, hidden=False)


def xxh32(data: bytes, seed: int = 0) -> int:
    p1, p2, p3, p4, p5 = 2654435761, 2246822519, 3266489917, 668265263, 374761393

    def u32(value: int) -> int:
        return value & 0xFFFFFFFF

    def rotl(value: int, bits: int) -> int:
        value = u32(value)
        return u32((value << bits) | (value >> (32 - bits)))

    length = len(data)
    index = 0
    if length >= 16:
        accs = [u32(seed + p1 + p2), u32(seed + p2), u32(seed), u32(seed - p1)]
        while index + 16 <= length:
            for slot in range(4):
                lane = int.from_bytes(data[index : index + 4], "little")
                index += 4
                accs[slot] = u32(rotl(u32(accs[slot] + u32(lane * p2)), 13) * p1)
        acc = u32(rotl(accs[0], 1) + rotl(accs[1], 7) + rotl(accs[2], 12) + rotl(accs[3], 18))
    else:
        acc = u32(seed + p5)
    acc = u32(acc + length)
    while index + 4 <= length:
        lane = int.from_bytes(data[index : index + 4], "little")
        index += 4
        acc = u32(rotl(u32(acc + u32(lane * p3)), 17) * p4)
    while index < length:
        acc = u32(rotl(u32(acc + data[index] * p5), 11) * p1)
        index += 1
    acc ^= acc >> 15
    acc = u32(acc * p2)
    acc ^= acc >> 13
    acc = u32(acc * p3)
    acc ^= acc >> 16
    return acc


def lz4_hidden_token_frame() -> bytes:
    """Framed lz4 whose block rebuilds the token only after decompression."""
    token = token_bytes()
    if token[4:12] != token[12:20]:
        raise SystemExit("lz4 fixture needs a repeated token prefix")
    prefix = token[:12]
    block = bytes([0xC4]) + prefix + b"\x08\x00" + b"\x04\x08\x00" + b"\x04\x08\x00" + bytes([0x40]) + token[36:]
    flg, bd = 0x60, 0x40
    desc = bytes([flg, bd])
    frame = (
        b"\x04\x22\x4d\x18"
        + desc
        + bytes([(xxh32(desc) >> 8) & 0xFF])
        + len(block).to_bytes(4, "little")
        + block
        + b"\x00\x00\x00\x00"
    )
    if token in frame or frame[:4] != b"\x04\x22\x4d\x18":
        raise SystemExit("lz4 fixture is not a hidden frame")
    return frame


def ustar_typed(payload: bytes, typeflag: bytes) -> bytes:
    bio = io.BytesIO()
    with tarfile.open(fileobj=bio, mode="w") as archive:
        info = tarfile.TarInfo("notes.bin")
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
    raw = bytearray(bio.getvalue())
    raw[156:157] = typeflag
    header = bytearray(raw[:512])
    header[148:156] = b"        "
    checksum = sum(header)
    raw[148:156] = f"{checksum:06o}".encode() + b"\x00 "
    return bytes(raw)


def odc_archive(name: bytes, body: bytes) -> bytes:
    def one(entry: bytes, payload: bytes) -> bytes:
        entry_b = entry + b"\x00"

        def field(value: int, width: int) -> bytes:
            return oct(value)[2:].encode().rjust(width, b"0")

        header = b"".join(
            [
                b"070707",
                field(1, 6),
                field(1, 6),
                field(0o100644, 6),
                field(0, 6),
                field(0, 6),
                field(1, 6),
                field(0, 6),
                field(0, 11),
                field(len(entry_b), 6),
                field(len(payload), 11),
            ]
        )
        if len(header) != 76:
            raise SystemExit("odc header is the wrong size")
        return header + entry_b + payload

    return one(name, body) + one(b"TRAILER!!!", b"")


def ar_archive_raw(members: list[tuple[bytes, bytes]]) -> bytes:
    out = [b"!<arch>\n"]
    for name, payload in members:
        if len(name) > 16:
            raise SystemExit("ar name is longer than the header field")
        header = b"".join(
            [
                name.ljust(16),
                b"0".ljust(12),
                b"0".ljust(6),
                b"0".ljust(6),
                b"100644".ljust(8),
                str(len(payload)).encode().ljust(10),
                b"`\n",
            ]
        )
        if len(header) != 60:
            raise SystemExit("ar header is the wrong size")
        out.append(header)
        out.append(payload)
        if len(payload) % 2:
            out.append(b"\n")
    return b"".join(out)


def ar_archive(name: str, payload: bytes) -> bytes:
    header = b"".join(
        [
            (name + "/").encode().ljust(16),
            b"0".ljust(12),
            b"0".ljust(6),
            b"0".ljust(6),
            b"100644".ljust(8),
            str(len(payload)).encode().ljust(10),
            b"`\n",
        ]
    )
    if len(header) != 60:
        raise SystemExit("ar header is the wrong size")
    pad = b"\n" if len(payload) % 2 else b""
    return b"!<arch>\n" + header + payload + pad


def b64url_gzip_token() -> bytes:
    for extra in range(256):
        raw = gzip.compress(bytes([extra]) + token_bytes())
        encoded = base64.urlsafe_b64encode(raw)
        if (b"-" in encoded or b"_" in encoded) and token_bytes() not in encoded:
            return encoded
    raise SystemExit("base64url fixture did not need the url alphabet")


# brotli(token) for the synthetic token. Raw brotli has no magic.
BROTLI_TOKEN = bytes.fromhex("1b2700f8e5c9217207242849a0056f4b2a51880a07aad90f13d7ce2b80c4")


def case_overwrite_plain() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"notes.txt": token_bytes() + b"\n"}, "add notes")
    repo.base = repo.rev()
    repo.commit({"notes.txt": b"hello\n"}, "replace notes")
    return repo, repo.push_env()


def case_overwrite_gzip() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"notes.bin": require_hidden(gzip.compress(token_bytes()))}, "add notes")
    repo.base = repo.rev()
    repo.commit({"notes.bin": b"hello\n"}, "replace notes")
    return repo, repo.push_env()


def case_replace_symlink() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"notes.txt": token_bytes() + b"\n"}, "add notes")
    repo.base = repo.rev()
    path = Path(repo.dir) / "notes.txt"
    path.unlink()
    path.symlink_to("README")
    run_git(["-C", repo.dir, "add", "--", "notes.txt"])
    run_git(["-C", repo.dir, "commit", "-q", "-m", "replace with symlink"])
    return repo, repo.push_env()


def case_replace_gitlink() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit({"notes.txt": token_bytes() + b"\n"}, "add notes")
    repo.base = repo.rev()
    link = repo.rev()
    run_git(["-C", repo.dir, "update-index", "--cacheinfo", f"160000,{link},notes.txt"])
    run_git(["-C", repo.dir, "commit", "-q", "-m", "replace with gitlink"])
    shown = run_git(["-C", repo.dir, "diff-tree", "-r", "--root", "HEAD"])
    if "160000" not in shown:
        raise SystemExit("gitlink replace fixture has no mode 160000")
    return repo, repo.push_env()


def case_tar_type_z() -> tuple[Repo, dict[str, str]]:
    blob = ustar_typed(gzip.compress(token_bytes()), b"Z")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_lz4_frame() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", lz4_hidden_token_frame())


def case_brotli_raw() -> tuple[Repo, dict[str, str]]:
    if token_bytes() in BROTLI_TOKEN or b"\x1f\x8b" in BROTLI_TOKEN:
        raise SystemExit("brotli fixture is not hidden")
    return prepare_secret_file("notes.bin", BROTLI_TOKEN)


def case_cpio_nul_zlib() -> tuple[Repo, dict[str, str]]:
    blob = newc_cpio("secret.bin", b"\x00" * 8 + zlib.compress(token_bytes()))
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_odc_nul_zlib() -> tuple[Repo, dict[str, str]]:
    blob = odc_archive(b"n", b"\x00" * 4 + zlib.compress(token_bytes()))
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_ustar_nul_lzma() -> tuple[Repo, dict[str, str]]:
    payload = b"\x00" * 8 + lzma.compress(token_bytes(), format=lzma.FORMAT_ALONE)
    blob = ustar_typed(payload, b"0")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_ar_nul_zlib() -> tuple[Repo, dict[str, str]]:
    blob = ar_archive("n", b"\x00" * 8 + zlib.compress(token_bytes()))
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_b64_b64_gzip() -> tuple[Repo, dict[str, str]]:
    inner = base64.b64encode(gzip.compress(token_bytes()))
    return prepare_secret_file("notes.bin", require_hidden(base64.b64encode(inner)))


def case_b64url_gzip() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", require_hidden(b64url_gzip_token()))


def case_hex_gzip() -> tuple[Repo, dict[str, str]]:
    return prepare_secret_file("notes.bin", require_hidden(gzip.compress(token_bytes()).hex().encode()))


def case_b64_wrap16() -> tuple[Repo, dict[str, str]]:
    encoded = base64.b64encode(gzip.compress(token_bytes()))
    wrapped = b"\n".join(encoded[i : i + 16] for i in range(0, len(encoded), 16)) + b"\n"
    return prepare_secret_file("notes.bin", require_hidden(wrapped))


def case_b64_zlib_short() -> tuple[Repo, dict[str, str]]:
    encoded = base64.b64encode(zlib.compress(token_bytes()))
    if len(encoded) >= 40:
        raise SystemExit("short base64 fixture is not under the old floor")
    return prepare_secret_file("notes.bin", require_hidden(encoded))


def case_utf16_token() -> tuple[Repo, dict[str, str]]:
    blob = token_bytes().decode().encode("utf-16-le")
    return prepare_secret_file("notes.bin", require_hidden(blob))


def mktag(repo: Repo, object_sha: str, objtype: str, name: str, message: bytes) -> str:
    tagger = b"Tester <dev@bossboard.test> 1000000000 +0000"
    body = (
        b"object " + object_sha.encode() + b"\n"
        b"type " + objtype.encode() + b"\n"
        b"tag " + name.encode() + b"\n"
        b"tagger " + tagger + b"\n\n" + message
    )
    return run_git(["-C", repo.dir, "mktag"], data=body)


def tag_push_env(repo: Repo, tag_sha: str, name: str) -> dict[str, str]:
    repo.ensure_origin()
    run_git(["-C", repo.dir, "update-ref", f"refs/tags/{name}", tag_sha])
    run_git(["-C", repo.dir, "push", "-q", "origin", "HEAD:refs/heads/main"])
    run_git(["-C", repo.dir, "push", "-q", "origin", "tag", name])
    repo.track("main")
    run_git(["-C", repo.dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"])
    return repo.push_env(
        BASE_SHA=ZERO_SHA,
        GITHUB_REF=f"refs/tags/{name}",
        GITHUB_REF_NAME=name,
        GITHUB_REF_TYPE="tag",
    )


def case_tag_chain() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    inner = mktag(repo, repo.rev(), "commit", "inner-tag", token_bytes() + b"\n")
    outer = mktag(repo, inner, "tag", "outer-tag", b"outer\n")
    return repo, tag_push_env(repo, outer, "outer-tag")


def case_tag_message_gzip() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    message = require_hidden(gzip.compress(token_bytes()))
    tag_sha = mktag(repo, repo.rev(), "commit", "gzip-msg", message)
    return repo, tag_push_env(repo, tag_sha, "gzip-msg")


def case_commit_header() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    tree = run_git(["-C", repo.dir, "rev-parse", "HEAD^{tree}"])
    parent = repo.rev()
    body = (
        f"tree {tree}\nparent {parent}\n"
        "author Tester <dev@bossboard.test> 1000000000 +0000\n"
        "committer Tester <dev@bossboard.test> 1000000000 +0000\n"
        f"x-secret {token_text()}\n\nempty\n"
    ).encode()
    sha = run_git(["-C", repo.dir, "hash-object", "-t", "commit", "-w", "--stdin"], data=body)
    run_git(["-C", repo.dir, "update-ref", "HEAD", sha])
    repo.base = parent
    return repo, repo.push_env()


def case_preimage_collision() -> tuple[Repo, dict[str, str]]:
    """Preimage of foo and an added file at preimage/foo must both survive.

    The secret is gzip, so the patch does not contain the token. The two
    clean files are different bytes, so identical-sha dedup does not skip
    the second write.
    """
    repo = Repo()
    repo.commit({"foo": require_hidden(gzip.compress(token_bytes()))}, "add secret")
    repo.base = repo.rev()
    repo.commit(
        {"foo": b"clean-one\n", "preimage/foo": b"clean-two\n"},
        "replace and collide",
    )
    return repo, repo.push_env()


def case_ar_special(name: bytes) -> tuple[Repo, dict[str, str]]:
    body = gzip.compress(token_bytes())
    blob = ar_archive_raw([(name, body), (b"hello.txt/", b"hello\n")])
    return prepare_secret_file("notes.bin", require_hidden(blob))


def case_ar_special_empty() -> tuple[Repo, dict[str, str]]:
    blob = ar_archive_raw(
        [
            (b"/", b""),
            (b"//", b""),
            (b"/SYM64/", b""),
            (b"hello.txt/", b"hello\n"),
        ]
    )
    return prepare_secret_file("notes.bin", blob, hidden=False)


def case_ar_special_counted() -> tuple[Repo, dict[str, str]]:
    members = [(f"m{i}.txt/".encode(), b"a") for i in range(2000)]
    members.append((b"/", b"x"))
    return prepare_secret_file("notes.bin", ar_archive_raw(members), hidden=False)


def case_issuer_plus_token() -> tuple[Repo, dict[str, str]]:
    repo = Repo()
    repo.commit(
        {"apps/mobile/eas.json": b"69a6de88-9efd-47e3-e053-5b8c7c11a4d1\n" + token_bytes() + b"\n"},
        "add id",
    )
    return repo, repo.push_env()


CASES = [
    ("clean-push", 0, case_clean_push, 90, None),
    ("clean-zip", 0, case_clean_zip, 90, None),
    ("clean-gz", 0, case_clean_gz, 90, None),
    ("clean-png", 0, case_clean_png, 90, None),
    ("clean-tar-gz", 0, case_clean_tar_gz, 90, None),
    ("zip-notes.bin", 2, case_zip_bin, 90, 0),
    ("zip-notes.png", 2, case_zip_png, 90, 0),
    ("zip-inner.bin", 2, case_zip_inner_bin, 90, 0),
    ("gzip-notes.bin", 2, case_gz_bin, 90, 0),
    ("gzip-of-zip", 2, case_gz_of_zip, 90, 0),
    ("nul-gzip-bin", 2, lambda: case_nul_prefixed("gzip", "notes.bin"), 90, 0),
    ("nul-gzip-gz", 2, lambda: case_nul_prefixed("gzip", "notes.gz"), 90, 0),
    ("nul-gzip-none", 2, lambda: case_nul_prefixed("gzip", "notes"), 90, 0),
    ("nul-gzip-zip", 2, lambda: case_nul_prefixed("gzip", "notes.zip"), 90, 0),
    ("nul-zip-bin", 2, lambda: case_nul_prefixed("zip", "notes.bin"), 90, 0),
    ("nul-zip-gz", 2, lambda: case_nul_prefixed("zip", "notes.gz"), 90, 0),
    ("nul-zip-none", 2, lambda: case_nul_prefixed("zip", "notes"), 90, 0),
    # A .zip name is opened by gitleaks itself, which accepts a leading NUL,
    # so the previous job already exited 2. The other names did not.
    ("nul-zip-zip", 2, lambda: case_nul_prefixed("zip", "notes.zip"), 90, 2),
    ("lying-token-bin", 1, lambda: case_lying_token("notes.bin"), 90, 0),
    ("lying-token-zip", 1, lambda: case_lying_token("notes.zip"), 90, 0),
    ("lying-token-none", 1, lambda: case_lying_token("notes"), 90, 0),
    ("lying-zero-bin", 1, lambda: case_lying_zero("notes.bin"), 120, 0),
    ("lying-zero-zip", 1, lambda: case_lying_zero("notes.zip"), 120, 0),
    ("lying-zero-none", 1, lambda: case_lying_zero("notes"), 120, 0),
    ("bzip2-notes.png", 2, case_bz2_png, 90, None),
    ("xz-notes.bin", 2, case_xz_bin, 90, None),
    ("zeros-gz-33mib", 1, case_zeros_gz, 120, 0),
    ("zeros-bz2-33mib", 1, case_zeros_bz2, 120, None),
    ("zeros-xz-33mib", 1, case_zeros_xz, 180, None),
    ("seven-z", 1, case_seven_z, 90, None),
    ("rar-magic", 1, case_rar, 90, None),
    ("zstd-magic", 1, case_zstd, 90, None),
    ("zip-of-rar", 1, case_zip_of_rar, 90, None),
    ("deep-rar", 1, case_deep_rar, 90, None),
    ("oversize-zip", 1, case_oversize_zip, 120, None),
    ("members-2001", 1, case_too_many_members, 120, None),
    ("members-2000", 0, case_member_boundary, 120, None),
    ("nested-4", 2, case_nested_4, 90, None),
    ("nested-9", 1, case_nested_9, 90, None),
    ("ignore-dir-zip", 2, case_ignore_dir_zip, 90, None),
    ("raw-png", 2, case_raw_png, 90, None),
    ("raw-pdf", 2, case_raw_pdf, 90, None),
    ("raw-bin", 2, case_raw_bin, 90, None),
    ("tar-gz-token", 2, case_tar_gz, 90, None),
    ("message-only", 2, case_message_only, 90, None),
    ("author-only", 2, case_author_only, 90, None),
    ("committer-email", 2, case_committer_email, 90, None),
    ("hostile-config-message", 2, case_hostile_config_message, 90, None),
    ("token-in-toml", 2, case_token_in_toml, 90, None),
    ("gitleaks-allow", 2, case_allow_comment, 90, None),
    ("binary-attr", 2, case_binary_attr, 90, None),
    ("repo-ignore-fingerprint", 2, case_ignore_fingerprint, 90, None),
    ("ignore-dir-file", 2, case_ignore_dir_file, 90, None),
    ("ref-name", 2, case_ref_name, 90, None),
    ("tag-name", 2, case_tag_name, 90, None),
    ("clean-branch-on-main", 0, case_clean_branch_on_main, 90, None),
    ("two-new-refs", 2, case_two_new_refs, 90, None),
    ("clean-lightweight-tag", 0, case_clean_tag, 90, None),
    ("tagger-name", 2, case_tagger_name, 90, None),
    ("annotated-blob-tag", 2, case_blob_tag, 90, None),
    ("clean-blob-tag", 0, case_clean_blob_tag, 90, None),
    ("type-change-dispatch", 2, case_type_change, 120, None),
    ("pr-png", 2, case_pr_png, 90, None),
    ("exact-akia", 0, case_exact_akia, 90, None),
    ("akia-plus-token", 2, case_akia_plus_token, 90, None),
    ("other-akia", 2, case_other_akia, 90, None),
    ("issuer-id", 0, case_issuer, 90, None),
    ("issuer-plus-token", 2, case_issuer_plus_token, 90, None),
    ("trail-bz2-zip", 2, lambda: case_trail_after("bz2"), 90, 0),
    ("trail-xz-zip", 2, lambda: case_trail_after("xz"), 90, 0),
    ("trail-gz-zip", 2, lambda: case_trail_after("gzip"), 90, 0),
    ("zip-comment-gz", 2, case_zip_comment, 90, 0),
    ("zip-gap-gz", 2, case_zip_gap, 90, 0),
    ("zip-after-eocd", 2, case_zip_after_eocd, 90, 0),
    ("tar-tail-gz", 2, case_tar_tail, 90, 0),
    ("tar-name-gz", 2, case_tar_name, 90, 0),
    ("tar-link-gz", 2, case_tar_link, 90, 0),
    ("tar-pax-gz", 2, case_tar_pax, 90, 0),
    ("over-cap-suffix", 1, case_over_cap_suffix, 180, 0),
    ("tar-pad-gz", 2, case_tar_pad, 90, 0),
    ("zip-file-comment", 2, case_zip_file_comment, 90, 0),
    ("zip-local-extra", 2, case_zip_local_extra, 90, 0),
    ("gzip-fextra", 2, case_gzip_fextra, 90, 0),
    ("path-backslash", 2, case_path_backslash, 90, 0),
    ("path-dotdot", 2, case_path_dotdot, 90, 0),
    ("zlib-raw", 2, case_zlib_raw, 90, 0),
    ("zlib-stored-zip", 2, case_zlib_stored_zip, 90, 0),
    ("zlib-cpio", 2, case_zlib_cpio, 90, 0),
    ("lzma-alone", 2, case_lzma_alone, 90, 0),
    ("b64-gzip", 2, case_b64_gzip, 90, 0),
    ("tag-gzip-blob", 2, case_tag_gzip_blob, 90, 0),
    ("deleted-secret", 2, case_deleted_secret, 90, 0),
    ("deleted-gitlink", 0, case_deleted_gitlink, 90, 0),
    ("deleted-gitlink-secret", 2, case_deleted_gitlink_secret, 90, 0),
    ("global-members", 1, case_global_members, 180, 0),
    ("global-bytes", 1, case_global_bytes, 180, 0),
    ("overwrite-plain", 2, case_overwrite_plain, 90, 0),
    ("overwrite-gzip", 2, case_overwrite_gzip, 90, 0),
    ("replace-symlink", 2, case_replace_symlink, 90, 0),
    ("replace-gitlink", 2, case_replace_gitlink, 90, 0),
    ("tar-type-z", 2, case_tar_type_z, 90, 0),
    ("lz4-frame", 1, case_lz4_frame, 90, 0),
    ("brotli-raw", 0, case_brotli_raw, 90, 0),
    ("cpio-nul-zlib", 2, case_cpio_nul_zlib, 90, 0),
    ("odc-nul-zlib", 2, case_odc_nul_zlib, 90, 0),
    ("ustar-nul-lzma", 2, case_ustar_nul_lzma, 90, 0),
    ("ar-nul-zlib", 2, case_ar_nul_zlib, 90, 0),
    ("b64-b64-gzip", 2, case_b64_b64_gzip, 90, 0),
    ("b64url-gzip", 2, case_b64url_gzip, 90, 0),
    ("hex-gzip", 2, case_hex_gzip, 90, 0),
    ("b64-wrap-16", 2, case_b64_wrap16, 90, 0),
    ("b64-zlib-short", 2, case_b64_zlib_short, 90, 0),
    ("utf16-token", 2, case_utf16_token, 90, 0),
    ("tag-chain", 2, case_tag_chain, 90, 0),
    ("tag-message-gzip", 2, case_tag_message_gzip, 90, 0),
    ("commit-extra-header", 2, case_commit_header, 90, 0),
    ("preimage-collision", 2, case_preimage_collision, 90, None),
    ("ar-special-slash", 2, lambda: case_ar_special(b"/"), 90, None),
    ("ar-special-longname", 2, lambda: case_ar_special(b"//"), 90, None),
    ("ar-special-sym64", 2, lambda: case_ar_special(b"/SYM64/"), 90, None),
    ("ar-special-empty", 0, case_ar_special_empty, 90, None),
    ("ar-special-counted", 1, case_ar_special_counted, 120, None),
]


# Compared with PREV_REV, not OLD_REV. Old exit 0 means the secret was missed.
PREV_EXPECT = {
    "preimage-collision": 0,
    "ar-special-slash": 0,
    "ar-special-longname": 0,
    "ar-special-sym64": 0,
    "ar-special-empty": 0,
    "ar-special-counted": 0,
}


def run_case(name: str, script: str, setup, timeout: int) -> tuple[int, str, float]:
    repo, env = setup()
    try:
        return run_scan(script, repo.dir, env, timeout)
    finally:
        repo.cleanup()


def case_jwt(script: str) -> tuple[int, str, float]:
    dest = tempfile.mkdtemp(prefix="secscan-jwt-")
    try:
        run_git(["clone", "--quiet", "--local", str(ROOT), dest])
        run_git(["-C", dest, "checkout", "--quiet", "--detach", JWT_COMMIT])
        parent = run_git(["-C", dest, "rev-parse", f"{JWT_COMMIT}^"])
        env = {
            "EVENT": "push",
            "BASE_SHA": parent,
            "HEAD_SHA": JWT_COMMIT,
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_REF_NAME": "main",
            "GITHUB_REF_TYPE": "branch",
            "GITHUB_HEAD_REF": "",
        }
        return run_scan(script, dest, env, 180)
    finally:
        shutil.rmtree(dest, ignore_errors=True)


def main() -> int:
    check_static()
    new_script = extract_run(WORKFLOW.read_text())
    old_text = run_git(["-C", str(ROOT), "show", f"{OLD_REV}:.github/workflows/secrets-scan.yml"])
    old_script = extract_run(old_text)
    prev_text = run_git(["-C", str(ROOT), "show", f"{PREV_REV}:.github/workflows/secrets-scan.yml"])
    prev_script = extract_run(prev_text)
    subprocess.run(["bash", "-n"], input=new_script.encode(), check=True)
    subprocess.run(["bash", "-n"], input=old_script.encode(), check=True)
    subprocess.run(["bash", "-n"], input=prev_script.encode(), check=True)
    selected = [item for item in os.environ.get("CASES", "").split(",") if item]
    failed = 0
    print("case\texit\texpected\told\tseconds\tnote")
    for name, expected, setup, timeout, old_expected in CASES:
        if selected and not any(item in name for item in selected):
            continue
        code, output, elapsed = run_case(name, new_script, setup, timeout)
        note = ""
        if name == "zeros-gz-33mib" and "decompress cap" not in output:
            note = "missing decompress-cap marker"
        if name == "nested-9" and "Archive nesting exceeds" not in output:
            note = "missing depth marker"
        if name.startswith("lying-") and "declared size" not in output:
            note = "missing declared-size marker"
        if name == "over-cap-suffix" and "compressed blob exceeds cap" not in output:
            note = "missing over-cap marker"
        if name.startswith("global-") and "global archive cap" not in output:
            note = "missing global-cap marker"
        if name == "lz4-frame" and "unsupported archive" not in output:
            note = "missing lz4 marker"
        if name == "ar-special-counted" and "declared size" not in output:
            note = "missing member-cap marker"
        if name in {"clean-branch-on-main", "clean-lightweight-tag"} and (
            "feature-clean-tip" in output or "clean-tag-v1" in output
        ):
            note = "ref name was echoed"
        ok = code == expected and not note
        old_code = ""
        if old_expected is not None and (not selected or any(item in name for item in selected)):
            old, old_out, _old_elapsed = run_case(name, old_script, setup, timeout)
            old_code = str(old)
            if old != old_expected:
                ok = False
                note = (note + " " if note else "") + f"old exit {old} expected {old_expected}"
            if token_text() in old_out:
                raise SystemExit("token appeared in old scan output after redact")
        prev_expected = PREV_EXPECT.get(name)
        if prev_expected is not None and (not selected or any(item in name for item in selected)):
            prev, prev_out, _prev_elapsed = run_case(name, prev_script, setup, timeout)
            old_code = str(prev)
            if prev != prev_expected:
                ok = False
                note = (note + " " if note else "") + f"prev exit {prev} expected {prev_expected}"
            if token_text() in prev_out:
                raise SystemExit("token appeared in previous-head scan output after redact")
        if not ok:
            failed += 1
            detail = status_lines(output)
            print(f"{name}\t{code}\t{expected}\t{old_code}\t{elapsed:.1f}\tFAIL {note}")
            if detail:
                print(detail)
        else:
            marker = "decompress cap" if "decompress cap" in output else ""
            print(f"{name}\t{code}\t{expected}\t{old_code}\t{elapsed:.1f}\tOK {marker}".rstrip())
    if not selected or any(item in "jwt-history" for item in selected):
        code, output, elapsed = case_jwt(new_script)
        ok = code == 0
        if not ok:
            failed += 1
            print(f"jwt-history\t{code}\t0\t\t{elapsed:.1f}\tFAIL")
            print(status_lines(output))
        else:
            print(f"jwt-history\t{code}\t0\t\t{elapsed:.1f}\tOK")
    if failed:
        print(f"{failed} case(s) failed")
        return 1
    print("all selected cases passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
