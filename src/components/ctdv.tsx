import * as React from 'react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import './ctdv.css';
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import PetsSharpIcon from '@mui/icons-material/PetsSharp';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Modal from '@mui/material/Modal';
import Button from '@mui/material/Button';
import { useReducer } from 'react';

type AssignInfo = {
  name: string;
  breed: string;
  gender: string;
  location: string;
  time: string;
  info: string;
  phone: string;
};
type ActionType = {
  type:
      | 'setName'
      | 'setBreed'
      | 'setGender'
      | 'setLocation'
      | 'setTime'
      | 'setInfo'
      | 'setPhone';
  payload: string;
};
const initialAssignInfo: AssignInfo = {
  gender: '',
  breed: '',
  info: '',
  location: '',
  name: '',
  phone: '',
  time: '',
};

type KeyInfo = { translate: string; order: number };
const ContentKeyInfo = new Map<keyof AssignInfo, KeyInfo>([
  ['name', { translate: 'Tên', order: 0 }],
  ['breed', { translate: 'Giống', order: 1 }],
  ['gender', { translate: 'Giới tính', order: 2 }],
  ['location', { translate: 'Khu vực lạc', order: 3 }],
  ['time', { translate: 'Thời gian lạc', order: 4 }],
  ['info', { translate: 'Đặc điểm nhận dạng', order: 5 }],
  ['phone', { translate: 'Sdt liên hệ', order: 6 }],
]);
const optionTitle = new Map();
optionTitle.set('dog', 'TÌM CHÓ LẠC');
optionTitle.set('cat', 'TÌM MÈO LẠC');
optionTitle.set('dogFindOwner', 'CHÓ LẠC TÌM CHỦ');
optionTitle.set('catFindOwner', 'MÈO LẠC TÌM CHỦ');

function reducer(state: AssignInfo, action: ActionType): AssignInfo {
  switch (action.type) {
    case 'setName':
      return { ...state, name: action.payload };
    case 'setBreed':
      return { ...state, breed: action.payload };
    case 'setGender':
      return { ...state, gender: action.payload };
    case 'setLocation':
      return { ...state, location: action.payload };
    case 'setTime':
      return { ...state, time: action.payload };
    case 'setInfo':
      return { ...state, info: action.payload };
    case 'setPhone':
      return { ...state, phone: action.payload };
    default:
      return state;
  }
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: '80%',
  bgcolor: 'background.paper',
  border: '2px solid rgba(207, 76, 247, 0.863);',
  boxShadow: 24,
  p: 4,
  bg: '-moz-linear-gradient(-45deg, rgba(247, 202, 201, 1) 0%, rgba(146, 168, 209, 1) 100%)',
};

const generateContent = (assignInfo: AssignInfo) => {
  const keys = Object.keys(assignInfo).sort((a, b) => {
    return (
        ContentKeyInfo.get(a as keyof AssignInfo)?.order! -
        ContentKeyInfo.get(b as keyof AssignInfo)?.order!
    );
  }) as Array<keyof AssignInfo>;
  return keys.reduce((content, currentKey) => {
    if (assignInfo[currentKey] !== '') {
      const breakDown = content === '' ? '' : '\n';
      return `${content}${breakDown}${ContentKeyInfo.get(currentKey)
          ?.translate}: ${assignInfo[currentKey]}`;
    }
    return content;
  }, '');
};

export default function Ctdv() {
  const [option, setOption] = React.useState('dog');
  const [title, setTitle] = React.useState('TÌM CHÓ LẠC');
  const [isContentChanged, setIsContentChanged] = React.useState(false);
  const contentRef: any = React.useRef();
  const finalRef: any = React.useRef();

  const [assignInfo, dispatch] = useReducer(reducer, initialAssignInfo);

  const [assignedContent, setAssignedContent] = React.useState([1, 2, 3]);
  const [isAssigned, setIsAssigned] = React.useState(false);
  function handleAssign() {
    setIsAssigned(true);
    setOpen(false);
  }
  function handleChangeOption(event: SelectChangeEvent) {
    setOption(event.target.value);
    setTitle(optionTitle.get(event.target.value));
  }
  const [open, setOpen] = React.useState(false);
  function handleOpen() {
    setOpen(true);
  }
  function handleClose() {
    setOpen(false);
  }

  React.useEffect(() => {
    if (isAssigned) {
      contentRef.current.value = generateContent(assignInfo);
    }
    const footer =
        title === 'TÌM CHÓ LẠC' || title === 'TÌM MÈO LẠC'
            ? 'Nhờ mọi người giành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ.'
            : 'Nhờ mọi người giành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà ạ. Mình xin cảm ơn.';

    finalRef.current.value = `${title}
    
${contentRef.current.value
        .replaceAll(' :', ':')
        .replaceAll(' ,', ',')
        .replaceAll(' / mất:', ':')
        .replaceAll('Giống chó/mèo', 'Giống')}
    
${footer}`;
  }, [title, isContentChanged, isAssigned, assignInfo]);

  const handleContent = () => {
    setAssignedContent(contentRef.current.value.split(/\n/));
    setIsContentChanged(!isContentChanged);
  };
  const handleCopy = () => {
    navigator.clipboard
        .writeText(finalRef.current.value)
        .then(() => alert('copy success'))
        .catch(() => alert('copy fail'));
  };
  const handleReplicate = () => {
    navigator.clipboard
        .readText()
        .then((value) => {
          contentRef.current.value= value;
          setIsContentChanged(!isContentChanged);
        })
        .catch(() => alert('copy fail'));
  };
  const handleReload = () => {
    window.location.reload();
  };

  return (
      <>
        <PetsSharpIcon className="title-icon" />
        <h1>Tìm Chó Mèo Lạc Đà Nẵng</h1>
        <p>Thể loại</p>
        <Box sx={{ minWidth: 120 }}>
          <FormControl color="secondary" className="options">
            <InputLabel
                id="demo-simple-select-label"
                className="options"
            ></InputLabel>
            <Select
                labelId="demo-simple-select-label"
                id="demo-simple-select"
                value={option}
                // label="Thể loại"
                onChange={handleChangeOption}
            >
              <MenuItem value={'dog'}>Tìm Chó Lạc</MenuItem>
              <MenuItem value={'cat'}>Tìm Mèo Lạc</MenuItem>
              <MenuItem value={'dogFindOwner'}>Chó lạc tìm chủ</MenuItem>
              <MenuItem value={'catFindOwner'}>Mèo lạc tìm chủ</MenuItem>
            </Select>
          </FormControl>
          <br></br>
          <p>Nội dung</p>
          <TextareaAutosize
              aria-label="minimum height"
              minRows={10}
              onChange={handleContent}
              ref={contentRef}
              //   placeholder="Minimum 3 rows"
              //   style={{ width: 200 }}
          />
          <br></br>
          <div>
            <Button onClick={handleOpen}>Assign</Button>
            <Button onClick={handleReplicate} color={'secondary'}>Replicate</Button>
            <Modal
                open={open}
                onClose={handleClose}
                aria-labelledby="modal-modal-title"
                aria-describedby="modal-modal-description"
            >
              <Box sx={style}>
                <FormControl
                    id="content_title_type"
                    sx={{ m: 1, minWidth: 120, inlineSize: 40 }}
                >
                  <InputLabel id="demo-simple-select-label">Tên</InputLabel>
                  <Select
                      labelId="demo-simple-select-label"
                      id="demo-simple-select"
                      value={assignInfo.name}
                      label="name"
                      onChange={(e) =>
                          dispatch({ type: 'setName', payload: e.target.value })
                      }
                  >
                    {assignedContent.map((contentItem) => (
                        <MenuItem key={contentItem} value={contentItem}>
                          {contentItem}
                        </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                    id="content_title_type"
                    sx={{ m: 1, minWidth: 120, inlineSize: 40 }}
                >
                  <InputLabel id="demo-simple-select-label">Giống</InputLabel>
                  <Select
                      labelId="demo-simple-select-label"
                      id="demo-simple-select"
                      value={assignInfo.breed}
                      label="breed"
                      onChange={(e) =>
                          dispatch({ type: 'setBreed', payload: e.target.value })
                      }
                  >
                    {assignedContent.map((contentItem) => (
                        <MenuItem key={contentItem} value={contentItem}>
                          {contentItem}
                        </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                    id="content_title_type"
                    sx={{ m: 1, minWidth: 120, inlineSize: 40 }}
                >
                  <InputLabel id="demo-simple-select-label">Giới tính</InputLabel>
                  <Select
                      labelId="demo-simple-select-label"
                      id="demo-simple-select"
                      value={assignInfo.gender}
                      label="gender"
                      onChange={(e) =>
                          dispatch({ type: 'setGender', payload: e.target.value })
                      }
                  >
                    {assignedContent.map((contentItem) => (
                        <MenuItem key={contentItem} value={contentItem}>
                          {contentItem}
                        </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                    id="content_title_type"
                    sx={{ m: 1, minWidth: 120, inlineSize: 40 }}
                >
                  <InputLabel id="demo-simple-select-label">
                    Khu vực lạc
                  </InputLabel>
                  <Select
                      labelId="demo-simple-select-label"
                      id="demo-simple-select"
                      value={assignInfo.location}
                      label="location"
                      onChange={(e) =>
                          dispatch({ type: 'setLocation', payload: e.target.value })
                      }
                  >
                    {assignedContent.map((contentItem) => (
                        <MenuItem key={contentItem} value={contentItem}>
                          {contentItem}
                        </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                    id="content_title_type"
                    sx={{ m: 1, minWidth: 120, inlineSize: 40 }}
                >
                  <InputLabel id="demo-simple-select-label">
                    Thời gian lạc
                  </InputLabel>
                  <Select
                      labelId="demo-simple-select-label"
                      id="demo-simple-select"
                      value={assignInfo.time}
                      label="time"
                      onChange={(e) =>
                          dispatch({ type: 'setTime', payload: e.target.value })
                      }
                  >
                    {assignedContent.map((contentItem) => (
                        <MenuItem key={contentItem} value={contentItem}>
                          {contentItem}
                        </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                    id="content_title_type"
                    sx={{ m: 1, minWidth: 120, inlineSize: 40 }}
                >
                  <InputLabel id="demo-simple-select-label">Đặc điểm</InputLabel>
                  <Select
                      labelId="demo-simple-select-label"
                      id="demo-simple-select"
                      value={assignInfo.info}
                      label="info"
                      onChange={(e) =>
                          dispatch({ type: 'setInfo', payload: e.target.value })
                      }
                  >
                    {assignedContent.map((contentItem) => (
                        <MenuItem key={contentItem} value={contentItem}>
                          {contentItem}
                        </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl
                    id="content_title_type"
                    sx={{ m: 1, minWidth: 120, inlineSize: 40 }}
                >
                  <InputLabel id="demo-simple-select-label">Sdt</InputLabel>
                  <Select
                      labelId="demo-simple-select-label"
                      id="demo-simple-select"
                      value={assignInfo.phone}
                      label="phone"
                      onChange={(e) =>
                          dispatch({ type: 'setPhone', payload: e.target.value })
                      }
                  >
                    {assignedContent.map((contentItem) => (
                        <MenuItem key={contentItem} value={contentItem}>
                          {contentItem}
                        </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <br />
                <div id="Assign-Reload">
                  <Button
                      variant="contained"
                      sx={{ margin: '0 auto' }}
                      onClick={handleAssign}
                  >
                    Assign
                  </Button>
                  <Button
                      variant="contained"
                      color="error"
                      sx={{ margin: '0 auto' }}
                      onClick={handleReload}
                  >
                    Reload
                  </Button>
                </div>
              </Box>
            </Modal>
          </div>

          <p>Bài Viết</p>
          <TextareaAutosize
              aria-label="minimum height"
              minRows={12}
              ref={finalRef}
              //   placeholder="Minimum 3 rows"
              //   style={{ width: 200 }}
          />
        </Box>
        <button
            className="button"
            id="copy-button"
            data-clipboard-target="#final"
            onClick={handleCopy}
        >
          Copy
        </button>
      </>
  );
}
