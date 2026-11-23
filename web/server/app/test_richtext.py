"""Tests for the rich-text settings validator.

`validate_rich_text` decides whether a `PUT /settings` value may be stored, so
these cases double as the server's security contract: anything outside the
allow-list must be rejected, not quietly rewritten.
"""

import pytest

import richtext


@pytest.mark.parametrize(
    "value",
    [
        "plain text",
        "",
        "<p>paragraph</p>",
        "<p><strong>bold</strong> <em>italic</em> <u>under</u></p>",
        "<ul><li>one</li><li>two</li></ul>",
        "<ol><li>first</li></ol>",
        "<p>a<br>b</p>",
        '<a href="https://example.gov">link</a>',
        '<a href="mailto:help@example.gov">mail</a>',
        '<a href="#help">anchor</a>',
        '<a href="/settings">relative</a>',
        # Uppercase tags and attributes are the same element in HTML.
        '<A HREF="https://example.gov">link</A>',
        "<P>upper</P>",
        # A `>` inside a quoted attribute must not end the tag early.
        '<a href="https://example.gov/?a=1&b=2">q</a>',
    ],
)
def test_accepts_the_allowed_subset(value):
    assert richtext.validate_rich_text(value) is None


@pytest.mark.parametrize(
    ("value", "needle"),
    [
        ("<script>alert(1)</script>", "script"),
        ("<iframe src=x></iframe>", "iframe"),
        ("<h1>title</h1>", "h1"),
        ("<div>x</div>", "div"),
        ("<span style=\"color:red\">x</span>", "span"),
        ("<img src=x onerror=alert(1)>", "img"),
        ("<!-- comment -->", "comment"),
        ('<p onclick="alert(1)">x</p>', "onclick"),
        ('<a href="https://ok" onmouseover="x">y</a>', "onmouseover"),
        ('<p style="color:red">x</p>', "style"),
        ('<a href="javascript:alert(1)">x</a>', "links"),
        ('<a href="JaVaScRiPt:alert(1)">x</a>', "links"),
        ('<a href="data:text/html,x">x</a>', "links"),
        ('<a href="vbscript:x">x</a>', "links"),
        ('<a href="java\tscript:x">x</a>', "links"),
        ('<a href="https://ok" target="_blank">x</a>', "target"),
    ],
)
def test_rejects_markup_outside_the_allow_list(value, needle):
    problem = richtext.validate_rich_text(value)
    assert problem is not None, value
    assert needle.lower() in problem.lower(), problem


def test_plain_text_is_always_acceptable():
    """Every row saved before rich text existed is plain text."""
    assert richtext.validate_rich_text("To reset your password, contact an admin.") is None


@pytest.mark.parametrize(
    "value",
    [
        "<p><ul><li>one</li></ul></p>",
        "<p>before<ol><li>one</li></ol></p>",
    ],
)
def test_rejects_a_list_inside_a_paragraph(value):
    """Browsers implicitly close the paragraph, so the markup would lie.

    The client repairs this before saving; the endpoint rejects it, since a value
    arriving any other way is not something the editor produced.
    """
    problem = richtext.validate_rich_text(value)
    assert problem is not None
    assert "list" in problem.lower()


@pytest.mark.parametrize(
    "value",
    [
        "<ul><li>one</li></ul>",
        "<p>before</p><ul><li>one</li></ul><p>after</p>",
        "<p>a <strong>b</strong></p>",
        "<li>loose item</li>",
    ],
)
def test_sibling_blocks_are_acceptable(value):
    assert richtext.validate_rich_text(value) is None


@pytest.mark.parametrize(
    "value",
    ["", "   ", "<p></p>", "<p><br></p>", "<p>&nbsp;</p>", "<ul><li></li></ul>"],
)
def test_detects_visually_empty_values(value):
    assert richtext.is_visually_empty(value) is True


@pytest.mark.parametrize("value", ["<p>x</p>", "x", "<p><strong>x</strong></p>"])
def test_accepts_values_with_content(value):
    assert richtext.is_visually_empty(value) is False


def test_plain_text_view_flattens_blocks_and_entities():
    assert richtext.rich_text_to_plain_text("<p>a</p><p>b&nbsp;c</p>") == "a b c"
    assert richtext.rich_text_to_plain_text("<ul><li>a</li><li>b</li></ul>") == "a b"


def test_client_and_server_tag_sets_match():
    """The browser sanitizer and the server validator must agree.

    A tag the client keeps but the server rejects would make saving fail after an
    administrator used that formatting.
    """
    source = (
        __import__("pathlib")
        .Path(__file__)
        .resolve()
        .parents[3]
        / "web/client/app/src/utils/richtext.ts"
    )
    if not source.is_file():
        pytest.skip("client source not available in this checkout")

    client_block = source.read_text().split("RICH_TEXT_TAGS = [", 1)[1].split("]", 1)[0]
    client_tags = {
        item.strip().strip("'\"")
        for item in client_block.replace("\n", " ").split(",")
        if item.strip().strip("'\"")
    }

    assert client_tags == set(richtext.RICH_TEXT_TAGS)
