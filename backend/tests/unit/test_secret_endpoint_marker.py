from app.plugins.utils.secrets import endpoint_keys


def test_ui_endpoint_marks_a_field_with_any_name():
    schema = {"hub": {"type": "string", "ui": {"endpoint": True}}, "api_key": {"type": "password"}}
    assert endpoint_keys(schema) == {"hub"}


def test_unmarked_plain_name_is_not_an_endpoint():
    schema = {"address": {"type": "string"}, "other": {"type": "string", "ui": {"endpoint": False}}}
    assert endpoint_keys(schema) == set()
