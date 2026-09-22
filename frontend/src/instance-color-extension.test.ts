import { InstanceColorExtension } from "./instance-color-extension";

test("samples label neighbours only after Viv declares the channel sampler", () => {
  const extension = new InstanceColorExtension();
  const module = extension.getVivShaderTemplates().modules[0];

  expect(module.inject["fs:DECKGL_MUTATE_COLOR"]).not.toContain("texture(channel0");
  expect(module.inject["fs:#main-end"]).toContain("texture(channel0");
});

test("outlines boundaries between different adjacent instance IDs up to 20 pixels", () => {
  const extension = new InstanceColorExtension();
  const shader = extension.getVivShaderTemplates().modules[0].inject["fs:#main-end"];

  expect(shader).toContain("biomeroRadius <= 20");
  expect(shader).toContain("leftValue != biomeroValue");
  expect(shader).toContain("rightValue != biomeroValue");
  expect(shader).toContain("upValue != biomeroValue");
  expect(shader).toContain("downValue != biomeroValue");
});
