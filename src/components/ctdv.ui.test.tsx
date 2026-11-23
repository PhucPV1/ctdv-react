import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import Ctdv from './ctdv';

jest.mock('../utils/aiGen', () => ({
  generateWithAIStream: async function* (_rawContent: string, _title: string) {
    yield 'A';
  },
}));

type ClipboardMock = { writeText?: jest.Mock; readText?: jest.Mock };

function mockClipboard(clipboard: ClipboardMock) {
  Object.defineProperty(navigator, 'clipboard', {
    value: clipboard,
    configurable: true,
  });
}

afterEach(() => {
  delete (navigator as any).clipboard;
});

function setup() {
  render(<Ctdv />);
  const textareas = screen.getAllByRole('textbox') as HTMLTextAreaElement[];
  return {
    contentArea: textareas[0],
    postArea: textareas[textareas.length - 1],
  };
}

const button = (name: string) => screen.getByRole('button', { name });

function typeContent(contentArea: HTMLTextAreaElement, value: string) {
  fireEvent.change(contentArea, { target: { value } });
}

async function openSheet() {
  fireEvent.click(button('Assign'));
  return screen.findByRole('dialog');
}

async function waitForSheetClosed() {
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

test('choosing a category chip changes the post title', () => {
  const { postArea } = setup();

  fireEvent.click(button('Tìm mèo lạc'));

  expect(button('Tìm mèo lạc')).toHaveAttribute('aria-pressed', 'true');
  expect(button('Tìm chó lạc')).toHaveAttribute('aria-pressed', 'false');
  expect(postArea.value.startsWith('TÌM MÈO LẠC')).toBe(true);
});

test('Copy writes the post to the clipboard and confirms', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined);
  mockClipboard({ writeText });
  const { postArea } = setup();

  fireEvent.click(button('Copy'));

  expect(writeText).toHaveBeenCalledWith(postArea.value);
  expect(await screen.findByText('copy success')).toBeInTheDocument();
});

test('Copy reports a failure', async () => {
  mockClipboard({ writeText: jest.fn().mockRejectedValue(new Error('no')) });
  setup();

  fireEvent.click(button('Copy'));

  expect(await screen.findByText('copy fail')).toBeInTheDocument();
});

test('Copy reports a failure when the clipboard API is missing', async () => {
  setup();

  fireEvent.click(button('Copy'));

  expect(await screen.findByText('copy fail')).toBeInTheDocument();
});

test('Replicate replaces the content with the clipboard text', async () => {
  mockClipboard({ readText: jest.fn().mockResolvedValue('Milu\nPoodle') });
  const { contentArea } = setup();
  typeContent(contentArea, 'cũ');

  fireEvent.click(button('Replicate'));

  await waitFor(() => expect(contentArea).toHaveValue('Milu\nPoodle'));
});

test('Append adds the clipboard text on a new line', async () => {
  mockClipboard({ readText: jest.fn().mockResolvedValue('Đực') });
  const { contentArea } = setup();
  typeContent(contentArea, 'Milu');

  fireEvent.click(button('Append'));

  await waitFor(() => expect(contentArea).toHaveValue('Milu\nĐực'));
});

test('Replicate and Append report a clipboard failure', async () => {
  mockClipboard({ readText: jest.fn().mockRejectedValue(new Error('no')) });
  setup();

  fireEvent.click(button('Replicate'));
  expect(await screen.findByText('Replicate fail')).toBeInTheDocument();

  fireEvent.click(button('Append'));
  expect(await screen.findByText('Append fail')).toBeInTheDocument();
});

test('the Assign sheet offers the content lines for each field', async () => {
  const { contentArea } = setup();
  typeContent(contentArea, 'Milu\nPoodle');

  const dialog = await openSheet();
  const nameSelect = within(dialog).getByLabelText('Tên') as HTMLSelectElement;

  expect(Array.from(nameSelect.options).map((o) => o.textContent)).toEqual([
    '—',
    'Milu',
    'Poodle',
  ]);
  expect(within(dialog).getByLabelText('Sdt liên hệ')).toBeInTheDocument();
});

test('Assign in the sheet writes labelled lines into the content', async () => {
  const { contentArea } = setup();
  typeContent(contentArea, 'Milu\nPoodle');

  const dialog = await openSheet();
  fireEvent.change(within(dialog).getByLabelText('Tên'), {
    target: { value: 'Milu' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Assign' }));

  await waitForSheetClosed();
  expect(contentArea).toHaveValue('Tên: Milu');
});

test('Cancel in the sheet discards the selection', async () => {
  const { contentArea } = setup();
  typeContent(contentArea, 'Milu\nPoodle');

  let dialog = await openSheet();
  fireEvent.change(within(dialog).getByLabelText('Tên'), {
    target: { value: 'Milu' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

  await waitForSheetClosed();
  expect(contentArea).toHaveValue('Milu\nPoodle');

  dialog = await openSheet();
  expect(within(dialog).getByLabelText('Tên')).toHaveValue('');
});

test('the Assign sheet asks for content when there is none', async () => {
  setup();

  const dialog = await openSheet();

  expect(
    within(dialog).getByText(
      'Chưa có nội dung. Dán nội dung trước rồi mới Assign.',
    ),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Assign' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
});
