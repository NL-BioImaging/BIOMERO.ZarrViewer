from django.urls import path

from . import views

urlpatterns = [
    path("", views.viewer, name="biomero_zarr_viewer_index"),
    path(
        "api/analysis-skills/",
        views.analysis_skills,
        name="biomero_zarr_viewer_analysis_skills",
    ),
    path(
        "api/analysis-skills/<str:skill_name>/",
        views.analysis_skill,
        name="biomero_zarr_viewer_analysis_skill",
    ),
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
        "api/images/<int:image_id>/roi.png",
        views.roi_png,
        name="biomero_zarr_viewer_roi_png",
    ),
    path(
        "api/images/<int:image_id>/render.png",
        views.render_png,
        name="biomero_zarr_viewer_render_png",
    ),
    path(
        "data/images/<int:image_id>/<path:zarr_key>",
        views.data,
        name="biomero_zarr_viewer_data",
    ),
]
