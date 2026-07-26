import { describe, expect, it } from "vitest";
import { attachNgffPhysicalSizes, ngffPhysicalSizes } from "./ngff-physical-sizes";

const anisotropicMetadata = {
  multiscales: [{
    axes: [
      { name: "c", type: "channel" },
      { name: "z", type: "space", unit: "micrometer" },
      { name: "y", type: "space", unit: "micrometer" },
      { name: "x", type: "space", unit: "micrometer" },
    ],
    datasets: [{
      path: "0",
      coordinateTransformations: [{ type: "scale", scale: [1, 0.2, 0.066813, 0.066813] }],
    }],
  }],
};

describe("NGFF physical voxel sizes", () => {
  it("extracts anisotropic spatial scaling by named axis", () => {
    expect(ngffPhysicalSizes(anisotropicMetadata)).toEqual({
      x: { size: 0.066813, unit: "micrometer" },
      y: { size: 0.066813, unit: "micrometer" },
      z: { size: 0.2, unit: "micrometer" },
    });
  });

  it("normalizes mixed spatial units before Viv compares their values", () => {
    const metadata = {
      multiscales: [{
        axes: [
          { name: "z", unit: "nanometer" },
          { name: "y", unit: "micrometer" },
          { name: "x", unit: "micrometer" },
        ],
        datasets: [{
          path: "0",
          coordinateTransformations: [{ type: "scale", scale: [200, 0.1, 0.1] }],
        }],
      }],
    };
    expect(ngffPhysicalSizes(metadata)?.z).toEqual({ size: 0.2, unit: "micrometer" });
  });

  it("attaches the base sizes to every pyramid source without losing metadata", () => {
    const loader: any[] = [{ meta: { photometricInterpretation: 1 } }, {}];
    expect(attachNgffPhysicalSizes(loader, anisotropicMetadata)).toBe(loader);
    expect(loader[0].meta).toEqual({
      photometricInterpretation: 1,
      physicalSizes: ngffPhysicalSizes(anisotropicMetadata),
    });
    expect(loader[1].meta).toEqual({ physicalSizes: ngffPhysicalSizes(anisotropicMetadata) });
  });

  it("does not invent physical sizes when no valid scale exists", () => {
    const loader: any[] = [{}];
    expect(attachNgffPhysicalSizes(loader, { multiscales: [{ axes: [], datasets: [] }] })).toBe(loader);
    expect(loader[0]).toEqual({});
  });
});
