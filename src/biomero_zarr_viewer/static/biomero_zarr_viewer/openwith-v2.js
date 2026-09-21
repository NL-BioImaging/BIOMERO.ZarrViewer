(function () {
  "use strict";

  OME.setOpenWithEnabledHandler("biomero_zarr_viewer", function (selected) {
    // OMERO.web requires this handler to return synchronously. Store
    // eligibility is authoritative only after opening, where the viewer can
    // show the resolver's precise unsupported-store message.
    return selected.length === 1 && ["image", "plate"].indexOf(selected[0].type) !== -1;
  });

  OME.setOpenWithUrlProvider("biomero_zarr_viewer", function (selected, baseUrl) {
    var separator = baseUrl.indexOf("?") === -1 ? "?" : "&";
    var key = selected[0].type === "plate" ? "plate" : "image";
    return baseUrl + separator + key + "=" + encodeURIComponent(selected[0].id);
  });
})();
