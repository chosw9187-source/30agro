"""SG ERP 특정 화면을 엑셀로 내려받아 바탕화면\\ERP자동업로드 폴더에 저장한다.

사용법
  python erp_download.py --setup   계정(ID/PW)을 Windows 자격 증명 관리자에 저장
  python erp_download.py --test    브라우저를 띄워 눈으로 확인하며 1회 실행
  python erp_download.py           자동 실행(작업 스케줄러가 매일 10시에 호출)
"""
import argparse
import datetime
import getpass
import json
import logging
import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
LOG_DIR = BASE / "logs"
SERVICE = "SGERP_AUTO_DOWNLOAD"

log = logging.getLogger("erp")


def setup_logging():
    LOG_DIR.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(LOG_DIR / "erp_download.log", encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(fh)
    log.addHandler(sh)
    log.setLevel(logging.INFO)


def desktop_dir() -> Path:
    """OneDrive 로 바탕화면이 옮겨진 경우까지 고려해 실제 바탕화면 경로를 찾는다."""
    try:
        import winreg

        key = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
            return Path(os.path.expandvars(winreg.QueryValueEx(k, "Desktop")[0]))
    except Exception:
        return Path.home() / "Desktop"


def setup_credentials():
    import keyring

    uid = input("ERP 아이디: ").strip()
    pw = getpass.getpass("ERP 비밀번호 (입력 내용은 화면에 표시되지 않습니다): ")
    if not uid or not pw:
        sys.exit("아이디/비밀번호가 비어 있습니다.")
    keyring.set_password(SERVICE, "id", uid)
    keyring.set_password(SERVICE, "pw", pw)
    print("저장 완료: Windows 자격 증명 관리자에 보관되었습니다.")


def load_credentials():
    import keyring

    uid = keyring.get_password(SERVICE, "id")
    pw = keyring.get_password(SERVICE, "pw")
    if not uid or not pw:
        raise SystemExit("계정 정보가 없습니다. 1_계정등록.bat 을 먼저 실행하세요.")
    return uid, pw


def load_config():
    cfg = json.loads((BASE / "config.json").read_text(encoding="utf-8"))
    missing = [
        s.get("desc", s["action"])
        for s in cfg["steps"]
        if s["action"] not in ("wait", "goto") and not s.get("selector")
    ]
    if missing:
        raise SystemExit("config.json 의 selector 가 비어 있습니다: " + ", ".join(missing))
    if not any(s["action"] == "download" for s in cfg["steps"]):
        raise SystemExit("config.json 에 download 단계가 없습니다.")
    return cfg


def fill_vars(value, uid, pw, cfg):
    fmt = cfg.get("date_format", "%Y-%m-%d")
    today = datetime.date.today()
    return (
        str(value)
        .replace("{ID}", uid)
        .replace("{PW}", pw)
        .replace("{TODAY}", today.strftime(fmt))
        .replace("{YESTERDAY}", (today - datetime.timedelta(days=1)).strftime(fmt))
    )


def locate(page, step):
    # "frames": ["iframe#main", ...] 처럼 iframe 안의 요소도 지정할 수 있다.
    target = page
    for frame in step.get("frames", []):
        target = target.frame_locator(frame)
    return target.locator(step["selector"]).first


def do_step(page, step, uid, pw, save_dir, cfg):
    action = step["action"]
    log.info("단계: %s", step.get("desc", action))
    if action == "wait":
        page.wait_for_timeout(step.get("ms", 1000))
    elif action == "goto":
        page.goto(step["url"])
    elif action == "click":
        locate(page, step).click()
    elif action == "fill":
        locate(page, step).fill(fill_vars(step.get("value", ""), uid, pw, cfg))
    elif action == "select":
        locate(page, step).select_option(fill_vars(step.get("value", ""), uid, pw, cfg))
    elif action == "press":
        locate(page, step).press(step.get("key", "Enter"))
    elif action == "wait_for":
        locate(page, step).wait_for()
    elif action == "download":
        with page.expect_download() as info:
            locate(page, step).click()
        dl = info.value
        suffix = Path(dl.suggested_filename).suffix or ".xlsx"
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
        path = save_dir / f"{cfg.get('file_prefix', 'ERP')}_{stamp}{suffix}"
        dl.save_as(path)
        return path
    else:
        raise ValueError(f"알 수 없는 action: {action}")
    return None


def run_once(cfg, uid, pw, save_dir, headed):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel=cfg.get("browser_channel") or None,
            headless=cfg.get("headless", True) and not headed,
            slow_mo=300 if headed else 0,
        )
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(cfg.get("timeout_sec", 60) * 1000)
        page.on("dialog", lambda d: d.accept())  # ERP 의 alert/confirm 창 자동 확인
        try:
            page.goto(cfg["url"])
            saved = None
            for step in cfg["steps"]:
                saved = do_step(page, step, uid, pw, save_dir, cfg) or saved
            return saved
        except Exception:
            shot = LOG_DIR / f"error_{datetime.datetime.now():%Y%m%d_%H%M%S}.png"
            try:
                page.screenshot(path=str(shot), full_page=True)
                log.error("오류 화면 캡처: %s", shot)
            except Exception:
                pass
            raise
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--setup", action="store_true", help="계정 등록")
    parser.add_argument("--test", action="store_true", help="브라우저를 띄워 테스트 실행")
    args = parser.parse_args()

    if args.setup:
        setup_credentials()
        return 0

    setup_logging()
    cfg = load_config()
    uid, pw = load_credentials()
    save_dir = desktop_dir() / cfg.get("save_folder_name", "ERP자동업로드")
    save_dir.mkdir(parents=True, exist_ok=True)

    attempts = 1 + int(cfg.get("retries", 2))
    for n in range(1, attempts + 1):
        try:
            log.info("=== 다운로드 시작 (%d/%d) ===", n, attempts)
            path = run_once(cfg, uid, pw, save_dir, args.test)
            log.info("완료: %s", path)
            return 0
        except Exception as e:
            log.exception("실패 (%d/%d): %s", n, attempts, e)

    # 최종 실패 시 저장 폴더에 표시 파일을 남겨 바로 알아볼 수 있게 한다.
    marker = save_dir / f"[실패]_{datetime.date.today():%Y%m%d}.txt"
    marker.write_text(
        f"ERP 자동 다운로드 실패\n로그: {LOG_DIR / 'erp_download.log'}\n", encoding="utf-8"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
