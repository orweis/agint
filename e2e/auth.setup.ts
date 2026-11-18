import { test as setup } from "@playwright/test";

import { DEMO_USER } from "../scripts/demo-account";
import { DEMO_SESSION } from "./support/env";

/** Sign-in is rate limited, so the specs share one signed-in demo session. */
setup("sign in as the demo account", async ({ page }) => {
  await page.goto("/sign-in?next=/n/northstar");
  await page.getByLabel("Email").fill(DEMO_USER.email);
  await page.getByLabel("Password").fill(DEMO_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/n/northstar");
  await page.context().storageState({ path: DEMO_SESSION });
});
