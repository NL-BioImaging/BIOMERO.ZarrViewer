from django.urls import path

from . import views, neuroglancer, http_statistics

urlpatterns = [
    path('api/images/<int:image_id>/native-samples/',http_statistics.native_samples,name='biomero_zarr_viewer_native_samples'),
    path("api/images/<int:image_id>/metadata/", views.metadata_details, name="biomero_zarr_viewer_metadata"),
    path("api/images/<int:image_id>/neuroglancer/", neuroglancer.prepare, name="biomero_zarr_viewer_neuroglancer"),
    path("api/images/<int:image_id>/neuroglancer/<str:context_id>/<path:data_key>", neuroglancer.data, name="biomero_zarr_viewer_neuroglancer_data"),
    path("api/images/<int:image_id>/previews/", views.cached_previews, name="biomero_zarr_viewer_previews"),
    path("api/images/<int:image_id>/volume/", views.cached_volume, name="biomero_zarr_viewer_volume"),
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
        "api/images/<int:image_id>/eligibility/",
        views.image_eligibility,
        name="biomero_zarr_viewer_image_eligibility",
    ),
    path(
        "api/plates/<int:plate_id>/capabilities/",
        views.plate_capabilities,
        name="biomero_zarr_viewer_plate_capabilities",
    ),
    path(
        "api/plates/<int:plate_id>/eligibility/",
        views.plate_eligibility,
        name="biomero_zarr_viewer_plate_eligibility",
    ),
    path(
        "api/wells/<int:well_id>/eligibility/",
        views.well_eligibility,
        name="biomero_zarr_viewer_well_eligibility",
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
        "api/images/<int:image_id>/render.svg",
        views.render_svg,
        name="biomero_zarr_viewer_render_svg",
    ),
    path(
        "data/images/<int:image_id>/<path:zarr_key>",
        views.data,
        name="biomero_zarr_viewer_data",
    ),
]
