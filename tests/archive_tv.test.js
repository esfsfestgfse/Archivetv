import { describe, expect, it } from "vitest";
import { TestDriver } from "testdriverai/vitest/hooks";

describe("Archive TV ('The Dial')", () => {
  it("should power on, open program guide, and switch programs", async (context) => {
    const testdriver = TestDriver(context);

    await testdriver.provision.chrome({
      url: "https://esfsfestgfse.github.io/Archivetv/the_dial_desktop.html",
    });

    // 1. Power on the TV
    await testdriver.find("POWER button").click();
    const powerAssert = await testdriver.assert(
      "the television is powered on and displaying channel content"
    );
    expect(powerAssert).toBeTruthy();

    // 2. Open the Program Guide
    await testdriver.find("GUIDE button").click();
    const guideAssert = await testdriver.assert(
      "the program guide is open showing channel categories and listings"
    );
    expect(guideAssert).toBeTruthy();

    // 3. Close the Program Guide
    await testdriver.find("CLOSE button in the program guide").click();
    const closeAssert = await testdriver.assert(
      "the program guide is closed and the television broadcast is visible"
    );
    expect(closeAssert).toBeTruthy();

    // 4. Switch to the next program
    await testdriver.find("NEXT button on the control panel").click();
    const nextAssert = await testdriver.assert(
      "the television broadcast has updated to a new program"
    );
    expect(nextAssert).toBeTruthy();
  });
});
