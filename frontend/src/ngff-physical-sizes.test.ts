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
      physicalOrigin: {c:0,z:0,y:0,x:0},
      volumeTranslation: {x:0,y:0,z:0},
      volumeScale: { x: 1, y: 1, z: 1 },
      physicalSizes: ngffPhysicalSizes(anisotropicMetadata),
    });
    expect(loader[1].meta).toEqual({ physicalOrigin:{c:0,z:0,y:0,x:0}, volumeTranslation:{x:0,y:0,z:0}, volumeScale: {}, physicalSizes: ngffPhysicalSizes(anisotropicMetadata) });
  });

  it("uses each dataset's declared scale, composing global transforms and mixed units", () => {
    const metadata = { ome: { multiscales: [{
      axes: [{ name: "z", unit: "nanometer" }, { name: "y", unit: "micrometer" }, { name: "x", unit: "micrometer" }],
      coordinateTransformations: [{ type: "scale", scale: [2, 3, 4] }],
      datasets: [
        { coordinateTransformations: [{ type: "scale", scale: [200, 0.1, 0.1] }] },
        { coordinateTransformations: [{ type: "scale", scale: [200, 0.2, 0.3] }] },
        { coordinateTransformations: [{ type: "scale", scale: [400, 0.4, 0.6] }] },
      ],
    }] } };
    const loader: any[] = [{}, {}, {}];
    attachNgffPhysicalSizes(loader, metadata);
    expect(ngffPhysicalSizes(metadata, 2)?.z).toEqual({ size: 0.8, unit: "micrometer" });
    expect(loader[1].meta.volumeScale.x).toBeCloseTo(3);
    expect(loader[1].meta.volumeScale).toMatchObject({ y: 2, z: 1 });
    expect(loader[2].meta.volumeScale.x).toBeCloseTo(6);
    expect(loader[2].meta.volumeScale).toMatchObject({ y: 4, z: 2 });
    expect(loader[2].meta.physicalSizes).toEqual(loader[0].meta.physicalSizes);
  });

  it("does not invent physical sizes when no valid scale exists", () => {
    const loader: any[] = [{}];
    expect(attachNgffPhysicalSizes(loader, { multiscales: [{ axes: [], datasets: [] }] })).toBe(loader);
    expect(loader[0]).toEqual({});
  });
});
