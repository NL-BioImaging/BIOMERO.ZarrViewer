"""Atomic, session-bound contexts shared by all web workers and browser tabs."""
import hashlib
import json
import time

from . import volume_cache as cache
from .errors import ROILimitExceeded


def owner(session):
    key = getattr(session, "session_key", None)
    return hashlib.sha256(key.encode()).hexdigest() if key else None


def table(db):
    db.execute("CREATE TABLE IF NOT EXISTS ng_contexts (owner TEXT, id TEXT, expires REAL, value TEXT, PRIMARY KEY(owner,id))")


def put(session, identity, value):
    session_owner = owner(session)
    view_id = value.get("view_id", identity)
    if session_owner is None:
        # Compatibility for session adapters without a persistent session key.
        contexts = {k:v for k,v in session.get("biomero_neuroglancer", {}).items() if v.get("expires", 0) > time.time()}
        views = {v.get("view_id", k) for k, v in contexts.items()}
        if view_id not in views and len(views) >= 32:
            raise ROILimitExceeded("32 live 3D views are open. Retry after unused read contexts expire.")
        previous = [k for k, v in contexts.items() if k != identity and v.get("view_id", k) == view_id]
        for key in previous[:-2]:
            del contexts[key]
        for key in previous[-2:]:
            contexts[key] = {**contexts[key], "expires": min(contexts[key]["expires"], time.time()+10)}
        contexts[identity] = value
        session["biomero_neuroglancer"] = contexts
        return
    with cache.database() as db:
        table(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM ng_contexts WHERE expires <= ?", (time.time(),))
        rows = db.execute("SELECT id,value FROM ng_contexts WHERE owner=? ORDER BY rowid", (session_owner,)).fetchall()
        views = {json.loads(row["value"]).get("view_id", row["id"]) for row in rows}
        if view_id not in views and len(views) >= 32:
            raise ROILimitExceeded("32 live 3D views are open. Retry after unused read contexts expire.")
        # A time-lapse is one live view. Keep two recently superseded frames for
        # in-flight chunk requests, without invalidating any other browser tab.
        previous = [row["id"] for row in rows if row["id"] != identity and json.loads(row["value"]).get("view_id", row["id"]) == view_id]
        for key in previous[:-2]:
            db.execute("DELETE FROM ng_contexts WHERE owner=? AND id=?", (session_owner, key))
        for key in previous[-2:]:
            db.execute("UPDATE ng_contexts SET expires=MIN(expires,?) WHERE owner=? AND id=?", (time.time()+10, session_owner, key))
        db.execute("INSERT OR REPLACE INTO ng_contexts VALUES (?,?,?,?)", (session_owner, identity, value["expires"], json.dumps(value)))


def get(session, identity):
    session_owner = owner(session)
    if session_owner is None:
        value = session.get("biomero_neuroglancer", {}).get(identity)
        return value if value and value.get("expires", 0) > time.time() else None
    with cache.database() as db:
        table(db)
        row = db.execute("SELECT value FROM ng_contexts WHERE owner=? AND id=? AND expires>?", (session_owner, identity, time.time())).fetchone()
        return json.loads(row[0]) if row else None
