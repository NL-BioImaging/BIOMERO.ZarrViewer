class ViewerError(Exception):
    code = "viewer_error"
    status = 400

    def __init__(self, message=None, *, details=None):
        super().__init__(message or self.code)
        self.details = details


class ObjectNotFound(ViewerError):
    code = "image_not_found"
    status = 404


class PlateNotFound(ViewerError):
    code = "plate_not_found"
    status = 404


class WellNotFound(ViewerError):
    code = "well_not_found"
    status = 404


class StoreNotFound(ViewerError):
    code = "zarr_store_not_found"
    status = 422


class AmbiguousStore(ViewerError):
    code = "ambiguous_zarr_store"
    status = 422


class UnsupportedStore(ViewerError):
    code = "unsupported_ome_zarr"
    status = 422


class InvalidMetadata(ViewerError):
    code = "invalid_ome_zarr_metadata"
    status = 422


class UnsafePath(ViewerError):
    code = "unsafe_zarr_path"
    status = 400


class ContextRequired(ViewerError):
    code = "zarr_context_required"
    status = 401


class InvalidContext(ViewerError):
    code = "invalid_zarr_context"
    status = 403


class DataNotFound(ViewerError):
    code = "zarr_key_not_found"
    status = 404


class InvalidROI(ViewerError):
    code = "invalid_roi"
    status = 400


class StoreMismatch(ViewerError):
    code = "store_uuid_mismatch"
    status = 409


class ROILimitExceeded(ViewerError):
    code = "roi_limit_exceeded"
    status = 413
