import { expect, type Locator, type Page } from "@playwright/test"

/** Sonner toasts render as `li[data-sonner-toast]`; match on any text within the toast. */
export function toast(page: Page, text?: string | RegExp): Locator {
  const all = page.locator("[data-sonner-toast]")
  return text ? all.filter({ hasText: text }) : all
}

export async function expectToast(page: Page, text: string | RegExp, timeout = 30_000) {
  await expect(toast(page, text).first()).toBeVisible({ timeout })
}

/** Base UI Select: click the trigger, then pick the option by (partial) name. */
export async function selectOption(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click()
  await page.getByRole("option", { name: option }).first().click()
}

/** Base UI Slider: focus the (hidden) range input inside the thumb and nudge it with the keyboard. */
export async function nudgeSlider(slider: Locator, presses: number, key: "ArrowRight" | "ArrowLeft" = "ArrowRight") {
  const input = slider.locator("input[type=range]").first()
  await input.focus()
  for (let i = 0; i < presses; i++) await input.press(key)
}

/** Parse the first integer out of a locator's text. */
export async function intOf(loc: Locator): Promise<number> {
  const t = (await loc.textContent()) ?? ""
  const m = t.replace(/,/g, "").match(/-?\d+/)
  if (!m) throw new Error(`No integer in "${t}"`)
  return Number(m[0])
}
