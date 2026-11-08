from uuid import uuid4
import os

import pymysql


class Audit:
    def __init__(
        self,
        schedule_id=None,
        title=None,
        audit_date=None,
        risk_level=None,
        run_status=None,
        summary=None,
    ):

        self.audit_id = uuid4()
        self.schedule_id = schedule_id
        self.title = title
        self.audit_date = audit_date
        self.risk_level = risk_level
        self.run_status = run_status
        self.summary = summary
        self.tags = []

    def insert_audit_dict(self):
        return {
            "audit_id": self.audit_id,
            "schedule_id": self.schedule_id,
            "title": self.title,
            "risk_level": self.risk_level,
            "run_status": self.run_status,
            "summary": self.summary,
        }

    def insert_tags_dict_list(self):
        return [{"audit_id": self.audit_id, "tag_id": tag} for tag in self.tags]
