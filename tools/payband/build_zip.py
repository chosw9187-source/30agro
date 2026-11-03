"""Pay-band 시뮬레이터 배포용 ZIP을 만든다.

사용법:
    npm pack xlsx@0.18.5 && tar xzf xlsx-0.18.5.tgz
    python3 tools/payband/build_zip.py package/dist/xlsx.full.min.js

결과: tools/payband/dist/PayBand_시뮬레이터.zip
  - PayBand_시뮬레이터.html : 더블클릭으로 열리는 단독 파일 (엑셀 해석 모듈 내장, 인터넷 없이 동작)
  - PayBand_시뮬레이터_실행.bat : 같은 폴더의 HTML을 기본 브라우저로 연다
"""
import pathlib
import sys
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
NAME = "PayBand_시뮬레이터"
CDN_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>'


def main(lib_path: str) -> None:
    body = (HERE / "payband.html").read_text(encoding="utf-8")
    lib = pathlib.Path(lib_path).read_text(encoding="utf-8")
    if CDN_TAG not in body:
        sys.exit("payband.html에서 SheetJS 스크립트 태그를 찾지 못했습니다.")
    if "</script" in lib:
        sys.exit("SheetJS 본문에 </script 문자열이 있어 인라인할 수 없습니다.")
    body = body.replace(CDN_TAG, "<script>\n" + lib + "\n</script>")
    html = (
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "</head>\n<body>\n" + body + "\n</body>\n</html>\n"
    )
    # cmd.exe는 한글 배치 파일을 CP949로 읽는다. 줄바꿈도 CRLF여야 한다.
    bat = (
        "@echo off\r\n"
        f'start "" "%~dp0{NAME}.html"\r\n'
    ).encode("cp949")

    out = HERE / "dist"
    out.mkdir(exist_ok=True)
    zpath = out / f"{NAME}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        # 0x800 플래그(UTF-8 파일명)는 zipfile이 자동으로 켠다 → Windows 탐색기에서 한글 이름이 깨지지 않는다
        z.writestr(f"{NAME}/{NAME}.html", html.encode("utf-8"))
        z.writestr(f"{NAME}/{NAME}_실행.bat", bat)
    print(zpath, zpath.stat().st_size)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "package/dist/xlsx.full.min.js")
