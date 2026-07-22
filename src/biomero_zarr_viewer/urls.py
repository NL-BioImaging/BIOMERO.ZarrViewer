from django.urls import path

from . import views

urlpatterns = [
    path("", views.viewer, name="biomero_zarr_viewer_index"),
    path(
        "api/images/<int:image_id>/capabilities/",
        views.capabilities,
        name="biomero_zarr_viewer_capabilities",
    ),
    path(
        "api/plates/<int:plate_id>/capabilities/",
        views.plate_capabilities,
        name="biomero_zarr_viewer_plate_capabilities",
    ),
    path(
        "data/images/<int:image_id>/<path:zarr_key>",
        views.data,
        name="biomero_zarr_viewer_data",
    ),
]
