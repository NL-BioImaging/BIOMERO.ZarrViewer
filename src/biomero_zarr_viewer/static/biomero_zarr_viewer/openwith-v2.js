(function () {
  "use strict";

  OME.setOpenWithEnabledHandler("biomero_zarr_viewer", function (selected, callback) {
    if (selected.length !== 1 || ["image", "plate", "well"].indexOf(selected[0].type) === -1) return false;

    // OMERO.web passes only id/name/type here. Ask a lightweight endpoint that
    // checks the Fileset and BIOMERO registration annotations without opening
    // the store or inspecting Zarr metadata. Full validation still happens
    // when the viewer opens.
    var collection = selected[0].type === "plate" ? "plates" : selected[0].type === "well" ? "wells" : "images";
    window.fetch(
      "/biomero_zarr_viewer/api/" + collection + "/" + encodeURIComponent(selected[0].id) + "/eligibility/",
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
    var key = selected[0].type === "plate" ? "plate" : selected[0].type === "well" ? "well" : "image";
    return baseUrl + separator + key + "=" + encodeURIComponent(selected[0].id);
  });
})();
