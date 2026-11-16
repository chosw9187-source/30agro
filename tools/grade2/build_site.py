"""직급 분류 사이트를 보안코드로 암호화한 index.html 로 만든다 (GitHub Pages 배포용).

사용: SITE_PASSWORD=보안코드 python3 tools/grade2/build_site.py [출력폴더=_site]

- 페이지 내용 전체를 AES-256-GCM 으로 암호화 (키 = PBKDF2-SHA256 30만 회, 보안코드 + 무작위 salt)
- 보안코드를 모르면 HTML 소스를 열어도 내용을 볼 수 없음 (브라우저 WebCrypto 로 복호화)
- 직원 데이터는 페이지에 들어 있지 않음 : 각 사용자가 엑셀을 불러오면 그 브라우저에만 저장
"""
import base64, os, pathlib, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 300_000
ROOT = pathlib.Path(__file__).resolve().parent


def main(out_dir="_site"):
    pw = os.environ.get("SITE_PASSWORD", "")
    if len(pw) < 8:
        sys.exit("SITE_PASSWORD 환경변수(보안코드, 8자 이상)가 필요합니다.")
    body = (ROOT / "grade2.html").read_text(encoding="utf-8")
    page = ('<!doctype html><html lang="ko"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + body + "</body></html>")
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw.encode("utf-8"))
    ct = AESGCM(key).encrypt(iv, page.encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode()
    gate = (ROOT / "site_gate.html").read_text(encoding="utf-8")
    gate = (gate.replace("__SALT__", b64(salt)).replace("__IV__", b64(iv))
                .replace("__ITER__", str(ITER)).replace("__DATA__", b64(ct)))
    out = pathlib.Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(gate, encoding="utf-8")
    (out / ".nojekyll").write_text("", encoding="utf-8")
    print(f"{out / 'index.html'}  {len(gate):,} bytes")


if __name__ == "__main__":
    main(*sys.argv[1:])
