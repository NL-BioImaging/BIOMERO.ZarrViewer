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
    if session_owner is None:
        # Compatibility for session adapters without a persistent session key.
        contexts = {k:v for k,v in session.get("biomero_neuroglancer", {}).items() if v.get("expires", 0) > time.time()}
        if identity not in contexts and len(contexts) >= 32:
            raise ROILimitExceeded("32 live 3D views are open. Retry after unused read contexts expire.")
        contexts[identity] = value
        session["biomero_neuroglancer"] = contexts
        return
    with cache.database() as db:
        table(db)
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM ng_contexts WHERE expires <= ?", (time.time(),))
        exists = db.execute("SELECT 1 FROM ng_contexts WHERE owner=? AND id=?", (session_owner, identity)).fetchone()
        if not exists and db.execute("SELECT COUNT(*) FROM ng_contexts WHERE owner=?", (session_owner,)).fetchone()[0] >= 32:
            raise ROILimitExceeded("32 live 3D views are open. Retry after unused read contexts expire.")
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
