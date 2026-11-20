"""
Browser end-to-end test (Playwright + Chromium).
Run against a production build with the offline mock provider:
  npm run build && NODE_ENV=production PORT=5055 MOCK_DELAY_MS=25 npm --prefix server start
  pip install playwright && playwright install chromium
  python e2e/browser_e2e.py
"""
import re, time, json, sys
from playwright.sync_api import sync_playwright, expect

import os
BASE = os.environ.get("E2E_BASE_URL", "http://localhost:5055")
OUT = os.environ.get("E2E_OUT", "e2e/screenshots")
os.makedirs(OUT, exist_ok=True)
results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1360, "height": 860})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.goto(BASE)

    # Tones from server
    expect(page.get_by_role("radio", name="Professional")).to_have_attribute("aria-checked", "true")
    check("tone toggle loaded from /api/tones", page.get_by_role("radio").count() == 3)
    check("empty state shown", page.get_by_text("What can I help with?").is_visible())
    page.screenshot(path=f"{OUT}/01-empty.png")

    # Casual message, observe char-by-char streaming
    page.get_by_role("radio", name="Casual").click()
    page.get_by_role("textbox", name="Message").fill("How should I start learning Rust?")
    page.keyboard.press("Enter")
    ai = page.locator(".msg--ai .bubble--ai").last
    lengths = []
    t0 = time.time()
    while time.time() - t0 < 8:
        lengths.append(len(ai.inner_text()))
        if page.locator(".msg--ai .icon-btn", has_text="Copy").count(): break
        time.sleep(0.03)
    distinct = sorted(set(lengths))
    small_steps = sum(1 for a, b2 in zip(distinct, distinct[1:]) if b2 - a <= 3)
    check(f"streaming grows progressively ({len(distinct)} distinct lengths, {small_steps} steps of <=3 chars)", len(distinct) > 15 and small_steps > 5)
    check("user bubble rendered", page.locator(".bubble--user", has_text="Rust").is_visible())
    expect(page.locator(".msg--ai").last).to_contain_text("Ooh")
    check("casual tone reflected in reply + tag", page.locator(".msg--ai .tone-tag").last.inner_text() == "Casual")
    expect(page.locator(".thread__title").first).to_have_text("How should I start learning Rust?")
    check("thread appears in history sidebar", True)
    page.screenshot(path=f"{OUT}/02-casual.png")

    # Switch tone mid-conversation
    page.get_by_role("radio", name="Concise").click()
    page.get_by_role("textbox", name="Message").fill("Give me the short version")
    page.keyboard.press("Enter")
    expect(page.locator(".msg--ai").nth(1)).to_contain_text("Short answer", timeout=8000)
    page.wait_for_selector(".msg--ai >> nth=1 >> .icon-btn:has-text('Copy')")
    check("tone switches instantly per message", page.locator(".msg--ai .tone-tag").nth(1).inner_text() == "Concise")

    # Regenerate in another tone
    page.get_by_role("radio", name="Professional").click()
    page.get_by_role("button", name="Regenerate as Professional").click()
    expect(page.locator(".msg--ai").nth(1)).to_contain_text("Thank you for your question", timeout=10000)
    page.wait_for_selector(".msg--ai >> nth=1 >> .icon-btn:has-text('Copy')", timeout=10000)
    check("regenerate replaced answer in new tone", page.locator(".msg--ai").count() == 2 and page.locator(".msg--ai .tone-tag").nth(1).inner_text() == "Professional")
    page.screenshot(path=f"{OUT}/03-regenerated.png")
    check("page itself never scrolls (only the message pane does)",
          page.evaluate("document.scrollingElement.scrollHeight <= window.innerHeight + 1") and page.get_by_role("radio", name="Casual").is_visible())

    # Stop mid-stream
    page.get_by_role("textbox", name="Message").fill("Explain database indexing")
    page.keyboard.press("Enter")
    page.wait_for_function("document.querySelectorAll('.msg--ai .bubble--ai')[2]?.innerText.length > 40")
    page.get_by_role("button", name="Stop generating").click()
    expect(page.locator(".msg--ai").nth(2).locator(".status-note")).to_have_text("Stopped")
    stopped_len = len(page.locator(".msg--ai .bubble--ai").nth(2).inner_text())
    check("stop button halts generation", True)

    # Persistence: reload + reopen thread from history
    page.reload()
    page.locator(".thread__main").first.click()
    expect(page.locator(".msg--ai")).to_have_count(3)
    persisted = page.locator(".msg--ai").nth(2)
    check("reload restores thread from MongoDB with stopped partial answer",
          persisted.locator(".status-note").inner_text() == "Stopped" and len(persisted.locator(".bubble--ai").inner_text()) > 20)
    check("reopened thread restores last tone", page.get_by_role("radio", name="Professional").get_attribute("aria-checked") == "true")

    # Second thread + search
    page.get_by_role("button", name="New chat").click()
    page.get_by_role("radio", name="Concise").click()
    page.get_by_role("textbox", name="Message").fill("Banana bread baking temperature")
    page.keyboard.press("Enter")
    page.wait_for_selector(".msg--ai .icon-btn:has-text('Copy')", timeout=8000)
    expect(page.locator(".thread")).to_have_count(2)
    page.get_by_label("Search all chats").fill("rust")
    expect(page.locator(".result")).to_have_count(1)
    check("search finds matching thread with highlight", page.locator(".result mark").first.inner_text().lower() == "rust")
    page.screenshot(path=f"{OUT}/04-search.png")
    page.locator(".result").first.click()
    expect(page.locator(".topbar__title")).to_have_text("How should I start learning Rust?")
    check("search result opens the thread", True)
    page.get_by_label("Search all chats").fill("")

    # Rename + delete
    rust = page.locator(".thread", has_text="learning Rust")
    rust.hover()
    rust.get_by_role("button", name=re.compile("^Rename")).click()
    page.locator(".thread__input").fill("Rust study plan")
    page.keyboard.press("Enter")
    expect(page.locator(".thread__title", has_text="Rust study plan")).to_have_count(1)
    check("rename thread", True)
    check("rename kept the other thread intact", page.locator(".thread", has_text="Banana").count() == 1)
    page.locator(".thread", has_text="Banana").hover()
    page.locator(".thread", has_text="Banana").get_by_role("button", name=re.compile("^Delete")).click()
    page.get_by_role("button", name="Delete", exact=True).click()
    expect(page.locator(".thread")).to_have_count(1)
    check("delete thread", True)

    # Server-side validation surfaces in UI (oversized prompt)
    page.get_by_role("button", name="New chat").click()
    page.get_by_role("textbox", name="Message").fill("x" * 8100)
    page.keyboard.press("Enter")
    expect(page.locator(".banner")).to_contain_text("too long")
    check("server validation error shown + draft restored", len(page.get_by_role("textbox", name="Message").input_value()) == 8100)
    page.get_by_role("textbox", name="Message").fill("")
    page.get_by_role("button", name="Dismiss").click()

    # Mobile
    page.locator(".thread__main", has_text="Rust study plan").click()
    page.wait_for_selector(".msg--ai")
    page.set_viewport_size({"width": 390, "height": 800})
    page.wait_for_timeout(500)
    box = page.locator(".sidebar").bounding_box()
    check("mobile drawer hidden by default", box["x"] + box["width"] <= 1)
    page.screenshot(path=f"{OUT}/05-mobile.png")
    page.get_by_role("button", name="Open history").click()
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/06-mobile-drawer.png")
    check("mobile drawer opens", page.locator(".sidebar.is-open").count() == 1)

    # Dark mode
    dp = b.new_page(viewport={"width": 1360, "height": 860}, color_scheme="dark")
    dp.goto(BASE)
    dp.locator(".thread__main").first.click()
    dp.wait_for_selector(".msg--ai")
    dp.screenshot(path=f"{OUT}/07-dark.png")

    unexpected = [e for e in errors if "ERR_NAME_NOT_RESOLVED" not in e and "400 (Bad Request)" not in e]
    check(f"no unexpected browser errors {unexpected[:3]}", not unexpected)
    b.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(failed)}/{len(results)} E2E checks passed")
sys.exit(1 if failed else 0)
