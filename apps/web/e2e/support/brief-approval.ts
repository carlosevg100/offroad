import {expect, type Locator} from "@playwright/test";

/** Native self-review is an explicit human act; historical non-self briefs have no declaration. */
export async function declareExecutionBriefReview(brief: Locator, options: {required?: boolean} = {}) {
  const declaration = brief.getByRole('checkbox', {name: /Declaro que preparei e revisei|I declare that I prepared and reviewed/});
  if (options.required) await expect(declaration).toBeVisible();
  if (options.required || await declaration.count()) {
    await expect(declaration).toBeEnabled();
    await declaration.check();
    await expect(declaration).toBeChecked();
  }
}
