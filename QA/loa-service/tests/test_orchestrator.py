import pytest

from app.orchestrator import process_ticket


@pytest.mark.asyncio
async def test_hard_stop_skips_download(mocker):
    fetch_loa_mock = mocker.patch("app.orchestrator.fetch_loa")
    send_email_mock = mocker.patch("app.orchestrator.send_email")
    write_trace_mock = mocker.patch("app.orchestrator.write_trace")
    mocker.patch(
        "app.orchestrator.get_ticket",
        return_value={"properties": {"dm_client_id": "6286218"}},
    )
    mocker.patch(
        "app.orchestrator.get_client",
        return_value={
            "id": "6286218",
            "name": "John Doe",
            "program_type": "DS",
            "active_creditors": [{"id": "cred-1", "name": "CHASE BANK USA NA"}],
        },
    )
    mocker.patch("app.orchestrator.update_ticket")
    mocker.patch("app.orchestrator.add_note")

    payload = {"objectId": "999", "portalId": "39664811"}
    await process_ticket(payload)

    assert write_trace_mock.called
    assert write_trace_mock.call_args[0][0]["event"] == "LOA_BLOCKED"
    fetch_loa_mock.assert_not_called()
    send_email_mock.assert_not_called()
