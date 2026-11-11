import json
import os
import sys
from django.conf import settings
from django.test import Client
from django.core.management import call_command
from notes.tests import SnapshotValidationAndPersistenceTests

def main():
    # Setup Django environment
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "theMemo.settings")
    import django
    django.setup()

    # Create test database
    call_command('migrate', verbosity=0)

    # Prepare client and user
    client = Client()
    test = SnapshotValidationAndPersistenceTests()
    test.setUpTestData()
    client.force_login(test.user)

    data = test._load_snapshot()
    resp = client.put(f"/api/memo/notes/{data['id']}/", json.dumps(data), content_type="application/json")
    print("Status:", resp.status_code)
    print("Response:", resp.content.decode())

if __name__ == "__main__":
    main()