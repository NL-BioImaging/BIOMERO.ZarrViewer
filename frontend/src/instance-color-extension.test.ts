import { InstanceColorExtension } from "./instance-color-extension";

test("samples label neighbours only after Viv declares the channel sampler", () => {
  const extension = new InstanceColorExtension();
  const module = extension.getVivShaderTemplates().modules[0];

  expect(module.inject["fs:DECKGL_MUTATE_COLOR"]).not.toContain("texture(channel0");
  expect(module.inject["fs:#main-end"]).toContain("texture(channel0");
});
