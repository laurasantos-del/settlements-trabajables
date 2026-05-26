from app.blocker import blocked_match, normalize_creditor_name


def test_blocked_chase():
    assert blocked_match("CHASE BANK USA NA") == "chase"


def test_blocked_jpmorgan():
    assert blocked_match("JPMORGAN CHASE BANK") == "jpmorgan"


def test_blocked_amex():
    assert blocked_match("AMERICAN EXPRESS CENTURION") == "american express"


def test_blocked_amex_abbrev():
    assert blocked_match("AMEX") == "american express"


def test_blocked_discover():
    assert blocked_match("DISCOVER BANK") == "discover"


def test_blocked_disc_fnbsd():
    assert blocked_match("DISC/FNBSD") == "discover"


def test_not_blocked_capital_one():
    assert blocked_match("CAPITAL ONE") is None


def test_not_blocked_syncb():
    assert blocked_match("SYNCB/AMAZON PLCC") is None


def test_not_blocked_portfolio():
    assert blocked_match("PORTFOLIO RECOVERY A") is None


def test_normalize_punctuation():
    assert normalize_creditor_name("JP.MORGAN//CHASE") == "jp morgan chase"
