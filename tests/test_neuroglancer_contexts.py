from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import time

import pytest

from biomero_zarr_viewer import neuroglancer_contexts as contexts
from biomero_zarr_viewer.errors import ROILimitExceeded


def test_concurrent_tabs_keep_32_contexts_and_expire_without_silent_eviction(tmp_path, monkeypatch):
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_DIR", str(tmp_path / "contexts"))
    session = SimpleNamespace(session_key="authenticated-session")
    value = {"expires":time.time()+300,"token":"signed","sources":{}}
    # Initialize the database before exercising independent worker connections.
    contexts.put(session, "0", value)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda i: contexts.put(session, str(i), value), range(1,32)))
    assert all(contexts.get(session, str(i)) == value for i in range(32))
    assert contexts.get(SimpleNamespace(session_key="other-session"), "0") is None
    with pytest.raises(ROILimitExceeded, match="32 live"):
        contexts.put(session, "33", value)
    contexts.put(session, "0", {**value,"expires":time.time()-1})
    assert contexts.get(session, "0") is None
    contexts.put(session, "33", value)
    assert contexts.get(session, "1") == value


def test_long_time_lapse_counts_as_one_view_and_preserves_other_tabs(tmp_path, monkeypatch):
    monkeypatch.setenv("BIOMERO_ZARR_CACHE_DIR", str(tmp_path / "contexts"))
    session = SimpleNamespace(session_key="authenticated-session")
    value = {"expires": time.time()+300, "token": "signed", "sources": {}}
    for tab in range(31):
        contexts.put(session, f"tab-{tab}", value)
    for frame in range(100):
        contexts.put(session, f"frame-{frame}", {**value, "view_id": "movie-tab"})
    assert all(contexts.get(session, f"tab-{i}") == value for i in range(31))
    assert contexts.get(session, "frame-99")["view_id"] == "movie-tab"
    assert contexts.get(session, "frame-0") is None
    with contexts.cache.database() as db:
        assert db.execute("SELECT COUNT(*) FROM ng_contexts").fetchone()[0] == 34
    with pytest.raises(ROILimitExceeded, match="32 live"):
        contexts.put(session, "another-tab", value)
