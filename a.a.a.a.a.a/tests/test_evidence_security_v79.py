import json
from pathlib import Path

from tapeout_engine.hybrid_bootstrap import ResilientHybridFacade


def test_v79_collector_never_persists_raw_rpc_endpoint():
    root=Path(__file__).resolve().parents[1]
    s=(root/"macos/collect_live_evidence.sh").read_text()
    assert 'redact_rpc_url' in s
    assert "RPC_REQUEST_FAILED" in s
    assert "protocol-candidates.json" in s
    # Raw endpoint must be used for curl, but never printf'd to evidence.
    assert "printf '%s\\tPASS" not in s or '"$endpoint" "$started"' not in s
    assert '"$safe_endpoint" "$started"' in s


def test_v79_third_evidence_file_is_guaranteed(tmp_path, monkeypatch):
    root=tmp_path/"root"; runtime=tmp_path/"runtime"
    (root/"macos").mkdir(parents=True)
    script=root/"macos/collect_live_evidence.sh"
    script.write_text("#!/bin/bash\nexit 0\n"); script.chmod(0o755)
    monkeypatch.setenv("HYBRID_ROOT",str(root))
    monkeypatch.setenv("HYBRID_RUNTIME",str(runtime))
    f=ResilientHybridFacade(tmp_path/"missing.json",lambda *_: None)
    assert json.loads(f.evidence_file("protocol-candidates.json"))==[]
