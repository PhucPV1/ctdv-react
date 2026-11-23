import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import PetsSharpIcon from '@mui/icons-material/PetsSharp';
import './ctdv.css';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import { generateWithAIStream } from '../utils/aiGen';
import ActionBar from './ActionBar';
import AssignSheet from './AssignSheet';
import CategoryChips, { CategoryOption } from './CategoryChips';
import { AssignInfo, generateContent, initialAssignInfo } from './assignInfo';

const optionTitle: Record<CategoryOption, string> = {
  dog: 'TÌM CHÓ LẠC',
  cat: 'TÌM MÈO LẠC',
  dogFindOwner: 'CHÓ LẠC TÌM CHỦ',
  catFindOwner: 'MÈO LẠC TÌM CHỦ',
};

type RowRange = { min: number; max: number };
const CONTENT_ROWS: RowRange = { min: 6, max: 12 };
const POST_ROWS: RowRange = { min: 10, max: 20 };

// Sizes a textarea to its text, between rows.min and rows.max lines; beyond
// rows.max it scrolls inside. Both textareas are written through refs, so
// this is called by hand after every write.
function fitRows(textarea: HTMLTextAreaElement, rows: RowRange) {
  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || 24;
  const paddingY =
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0);
  const borderY =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);

  // Collapsing the textarea to measure it can shorten the page and make the
  // browser clamp the scroll position, so put the position back afterwards.
  const pageScroll = window.scrollY;
  textarea.style.height = 'auto';
  const textHeight = textarea.scrollHeight - paddingY;
  const minHeight = rows.min * lineHeight;
  const maxHeight = rows.max * lineHeight;
  const height = Math.min(Math.max(textHeight, minHeight), maxHeight);
  textarea.style.height = `${height + paddingY + borderY}px`;
  textarea.style.overflowY = textHeight > maxHeight ? 'auto' : 'hidden';
  if (window.scrollY !== pageScroll) window.scrollTo(0, pageScroll);
}

type Severity = 'success' | 'error';
type Notice = {
  open: boolean;
  message: string;
  severity: Severity;
  key: number;
};

export default function Ctdv() {
  const [option, setOption] = React.useState<CategoryOption>('dog');
  const [title, setTitle] = React.useState(optionTitle.dog);
  const [isContentChanged, setIsContentChanged] = React.useState(false);
  const contentRef = React.useRef<HTMLTextAreaElement>(null);
  const finalRef = React.useRef<HTMLTextAreaElement>(null);

  const [assignInfo, setAssignInfo] =
    React.useState<AssignInfo>(initialAssignInfo);
  const [assignedContent, setAssignedContent] = React.useState<string[]>([]);
  const [isAssigned, setIsAssigned] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice>({
    open: false,
    message: '',
    severity: 'success',
    key: 0,
  });

  const fitTextareas = React.useCallback(() => {
    if (contentRef.current) fitRows(contentRef.current, CONTENT_ROWS);
    if (finalRef.current) fitRows(finalRef.current, POST_ROWS);
  }, []);

  function notify(message: string, severity: Severity) {
    setNotice((previous) => ({
      open: true,
      message,
      severity,
      key: previous.key + 1,
    }));
  }

  function handleNoticeClose(_event: unknown, reason?: string) {
    if (reason === 'clickaway') return;
    setNotice((previous) => ({ ...previous, open: false }));
  }

  async function handleAiGen() {
    const post = finalRef.current!;
    setIsGenerating(true);
    const previousPost = post.value;
    post.value = '';
    try {
      for await (const chunk of generateWithAIStream(
        contentRef.current!.value,
        title,
      )) {
        post.value += chunk;
        fitRows(post, POST_ROWS);
        post.scrollTop = post.scrollHeight;
      }
    } catch (error) {
      // AI thất bại thì trả lại bài cũ, không để người dùng mất trắng.
      post.value = previousPost;
      fitRows(post, POST_ROWS);
      notify(
        `Lỗi AI gen: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleChangeOption(nextOption: CategoryOption) {
    setOption(nextOption);
    setTitle(optionTitle[nextOption]);
  }

  function handleAssign(next: AssignInfo) {
    setAssignInfo(next);
    setIsAssigned(true);
    setOpen(false);
  }

  React.useEffect(() => {
    const content = contentRef.current!;
    const post = finalRef.current!;
    if (isAssigned) {
      content.value = generateContent(assignInfo);
    }
    const footer =
      title === 'TÌM CHÓ LẠC' || title === 'TÌM MÈO LẠC'
        ? 'Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ.'
        : 'Nhờ mọi người dành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà ạ. Mình xin cảm ơn.';
    const processed = content.value
      .replaceAll(' :', ':')
      .replaceAll(' ,', ',')
      .replaceAll('( ', '(')
      .replaceAll(' )', ')')
      .replaceAll(' / mất:', ':')
      .replaceAll('Giống chó/mèo', 'Giống')
      .split('\n')
      .map((line: string) => line.charAt(0).toUpperCase() + line.slice(1))
      .join('\n');

    // The two separator lines hold exactly four spaces, as they always have.
    post.value = `${title}\n    \n${processed}\n    \n${footer}`;
    fitTextareas();
  }, [title, isContentChanged, isAssigned, assignInfo, fitTextareas]);

  // Line wrapping changes with the viewport width and once the web font loads.
  React.useEffect(() => {
    window.addEventListener('resize', fitTextareas);
    document.fonts?.ready.then(fitTextareas).catch(() => {});
    return () => window.removeEventListener('resize', fitTextareas);
  }, [fitTextareas]);

  function syncContent() {
    setAssignedContent(contentRef.current!.value.split(/\n/));
    setIsContentChanged((previous) => !previous);
  }

  function handleCopy() {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      notify('copy fail', 'error');
      return;
    }
    clipboard
      .writeText(finalRef.current!.value)
      .then(() => notify('copy success', 'success'))
      .catch(() => notify('copy fail', 'error'));
  }

  function handleReplicate() {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      notify('Replicate fail', 'error');
      return;
    }
    clipboard
      .readText()
      .then((value) => {
        contentRef.current!.value = value;
        syncContent();
      })
      .catch(() => notify('Replicate fail', 'error'));
  }

  function handleAppend() {
    const clipboard = navigator.clipboard;
    if (!clipboard) {
      notify('Append fail', 'error');
      return;
    }
    clipboard
      .readText()
      .then((value) => {
        const content = contentRef.current!;
        const currentValue = content.value;
        content.value = currentValue ? `${currentValue}\n${value}` : value;
        syncContent();
      })
      .catch(() => notify('Append fail', 'error'));
  }

  function handleReload() {
    window.location.reload();
  }

  const lines = React.useMemo(
    () =>
      Array.from(
        new Set(
          assignedContent
            .map((line) => line.trim())
            .filter((line) => line !== ''),
        ),
      ),
    [assignedContent],
  );

  return (
    <>
      <main className="ctdv-page">
        <header className="ctdv-header">
          <span className="ctdv-logo" aria-hidden="true">
            <PetsSharpIcon />
          </span>
          <h1>Tìm Chó Mèo Lạc Đà Nẵng</h1>
          <Button
            variant="outlined"
            size="small"
            color="secondary"
            onClick={handleReload}
          >
            Reload
          </Button>
        </header>

        <section className="ctdv-section">
          <h2 className="ctdv-label">Thể loại</h2>
          <CategoryChips
            value={option}
            onChange={handleChangeOption}
            disabled={isGenerating}
          />
        </section>

        <section className="ctdv-section">
          <div className="ctdv-label-row">
            <h2 className="ctdv-label">Nội dung</h2>
            <div className="ctdv-pills">
              <Button
                variant="outlined"
                size="small"
                onClick={handleAppend}
                disabled={isGenerating}
              >
                Append
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setOpen(true)}
                disabled={isGenerating}
              >
                Assign
              </Button>
            </div>
          </div>
          <textarea
            className="ctdv-textarea"
            aria-label="Nội dung"
            placeholder="Dán thông tin vào đây, mỗi ý một dòng"
            rows={CONTENT_ROWS.min}
            onChange={syncContent}
            readOnly={isGenerating}
            ref={contentRef}
          />
        </section>

        <section className="ctdv-section">
          <h2 className="ctdv-label">Bài Viết</h2>
          <textarea
            className="ctdv-textarea"
            aria-label="Bài Viết"
            rows={POST_ROWS.min}
            readOnly={isGenerating}
            ref={finalRef}
          />
        </section>
      </main>

      <ActionBar
        isGenerating={isGenerating}
        onReplicate={handleReplicate}
        onAiGen={handleAiGen}
        onCopy={handleCopy}
      />

      <AssignSheet
        open={open}
        lines={lines}
        value={assignInfo}
        onAssign={handleAssign}
        onCancel={() => setOpen(false)}
      />

      <Snackbar
        key={notice.key}
        open={notice.open}
        autoHideDuration={notice.severity === 'error' ? 6000 : 3000}
        onClose={handleNoticeClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          bottom: 'calc(84px + env(safe-area-inset-bottom))',
          left: '50%',
          right: 'auto',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 448,
        }}
      >
        <Alert severity={notice.severity} variant="filled" icon={false}>
          {notice.message}
        </Alert>
      </Snackbar>
    </>
  );
}
