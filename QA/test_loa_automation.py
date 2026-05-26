#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import unittest

import loa_automation as loa


class LoaAutomationTest(unittest.TestCase):
    def test_blocked_aliases_and_tokens(self):
        cases = {
            "JPMORGAN CHASE BANK NA": "jpmorgan",
            "CHASE BANK USA NA": "chase",
            "AMERICAN EXPRESS CENTURION": "american express",
            "AMEX": "american express",
            "AE Centurion": "american express",
            "DISC/FNBSD": "discover",
            "DISC BANK": "discover",
            "FNBSD": "discover",
            "Bank of America": None,
        }
        for raw_name, expected in cases.items():
            with self.subTest(raw_name=raw_name):
                self.assertEqual(loa.blocked_match(raw_name), expected)

    def test_build_plan_skips_documents_for_blocked_creditor(self):
        payload = {
            "client": {
                "client_id": "6286218",
                "first_name": "Melinda",
                "last_name": "Vasquez",
                "program_type": "Debt Settlement",
            },
            "creditors": [{"creditor_id": "1", "creditor_name": "DISC/FNBSD"}],
        }

        plans = loa.build_plan(payload, "5908385", {})

        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0].event, "LOA_BLOCKED")
        self.assertEqual(plans[0].matched_token, "discover")
        self.assertIn("SKIP", plans[0].document_action)
        self.assertIsNone(plans[0].filename)

    def test_postal_route_never_creates_letterstream_job_in_dry_run(self):
        payload = {
            "client": {"client_id": "123", "first_name": "Ana", "last_name": "Lopez"},
            "creditors": [{"creditor_id": "2", "creditor_name": "Merrick Bank"}],
        }
        directory = {
            "merrick bank": {
                "send_method": "letterstream",
                "letterstream_flag": "true",
                "postal_address": "P.O. Box 9201 Old Bethpage NY",
            }
        }

        plans = loa.build_plan(payload, "5908385", directory)

        self.assertEqual(plans[0].route, "postal_review")
        self.assertIn("LetterStream job not created", plans[0].delivery_action)


if __name__ == "__main__":
    unittest.main()
