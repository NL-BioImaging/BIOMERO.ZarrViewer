(function () {
  "use strict";

  OME.setOpenWithEnabledHandler("biomero_zarr_viewer", function (selected, callback) {
    if (selected.length !== 1 || ["image", "plate"].indexOf(selected[0].type) === -1) return false;

    // BIOMERO deliberately gives imported OMERO Images useful field/image
    // names, so the selected name often does not retain the .ome.zarr suffix.
    // Ask the authoritative capability endpoint instead of creating false
    // negatives from the display name. Plate selections resolve through their
    // first readable field and retain full HCS navigation in the viewer.
    var collection = selected[0].type === "plate" ? "plates" : "images";
    window.fetch(
      "/biomero_zarr_viewer/api/" + collection + "/" + encodeURIComponent(selected[0].id) + "/capabilities/",
      {credentials: "same-origin", headers: {Accept: "application/json"}}
    ).then(function (response) {
      if (!response.ok) return false;
      return response.json().then(function (payload) { return payload.supported === true; });
    }).then(function (enabled) {
      callback(enabled === true);
    }).catch(function () {
      callback(false);
    });
    return false;
  });

  OME.setOpenWithUrlProvider("biomero_zarr_viewer", function (selected, baseUrl) {
    var separator = baseUrl.indexOf("?") === -1 ? "?" : "&";
    var key = selected[0].type === "plate" ? "plate" : "image";
    return baseUrl + separator + key + "=" + encodeURIComponent(selected[0].id);
  });
})();
