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
