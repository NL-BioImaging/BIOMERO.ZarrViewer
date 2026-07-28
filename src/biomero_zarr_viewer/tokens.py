# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 NL-BioImaging contributors

from datetime import datetime, timedelta, timezone

from django.core import signing

from .errors import ContextRequired, InvalidContext
from .settings import context_ttl_seconds

TOKEN_HEADER = "HTTP_X_OMERO_ZARR_CONTEXT"
TOKEN_SALT = "biomero_zarr_viewer.context.v1"
TOKEN_VERSION = 1


def connection_user_id(conn):
    getter = getattr(conn, "getUserId", None)
    if getter:
        return int(getter())
    user = getattr(conn, "user", None)
    if user is not None:
        return int(user.getId())
    return int(conn.getEventContext().userId)


def active_group_id(request, conn):
    group_id = request.session.get("active_group")
    if group_id in (None, "-1", -1):
        group_id = conn.getEventContext().groupId
    return int(group_id)


def make_read_context(request, conn, image_id, store_relative):
    issued_at = datetime.now(timezone.utc)
    claims = {
        "v": TOKEN_VERSION,
        "uid": connection_user_id(conn),
        "gid": active_group_id(request, conn),
        "image_id": int(image_id),
        "store": str(store_relative).replace("\\", "/").strip("/"),
        "operations": ["read"],
    }
    token = signing.dumps(claims, salt=TOKEN_SALT, compress=True)
    expires = issued_at + timedelta(seconds=context_ttl_seconds())
    return token, expires


def validate_read_context(request, conn, image_id):
    token = request.META.get(TOKEN_HEADER)
    if not token:
        raise ContextRequired("Missing X-OMERO-Zarr-Context header")
    try:
        claims = signing.loads(
            token, salt=TOKEN_SALT, max_age=context_ttl_seconds()
        )
    except signing.SignatureExpired as exc:
        raise InvalidContext("The Zarr read context has expired") from exc
    except signing.BadSignature as exc:
        raise InvalidContext("The Zarr read context is invalid") from exc

    if claims.get("v") != TOKEN_VERSION:
        raise InvalidContext("Unsupported Zarr read context version")
    if int(claims.get("uid", -1)) != connection_user_id(conn):
        raise InvalidContext("The Zarr read context belongs to another user")
    if int(claims.get("gid", -2)) != active_group_id(request, conn):
        raise InvalidContext("The active OMERO group has changed")
    if int(claims.get("image_id", -1)) != int(image_id):
        raise InvalidContext("The Zarr read context belongs to another image")
    if "read" not in claims.get("operations", []):
        raise InvalidContext("The Zarr context does not allow reads")
    return claims
