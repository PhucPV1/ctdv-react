import * as React from "react"
import Box from "@mui/material/Box"
import InputLabel from "@mui/material/InputLabel"
import MenuItem from "@mui/material/MenuItem"
import FormControl from "@mui/material/FormControl"
import Select, { SelectChangeEvent } from "@mui/material/Select"
import "./ctdv.css"
import "@fontsource/roboto/300.css"
import "@fontsource/roboto/400.css"
import "@fontsource/roboto/500.css"
import "@fontsource/roboto/700.css"
import PetsSharpIcon from "@mui/icons-material/PetsSharp"
import TextareaAutosize from "@mui/material/TextareaAutosize"
import Modal from "@mui/material/Modal"
import Button from "@mui/material/Button"

export default function Ctdv() {
  const optionTitle = new Map()
  optionTitle.set("dog", "TÌM CHÓ LẠC")
  optionTitle.set("cat", "TÌM MÈO LẠC")
  optionTitle.set("dogFindOwner", "CHÓ LẠC TÌM CHỦ")
  optionTitle.set("catFindOwner", "MÈO LẠC TÌM CHỦ")

  const [option, setOption] = React.useState("dog")
  const [title, setTitle] = React.useState("TÌM CHÓ LẠC")
  const [isContentChanged, setIsContentChanged] = React.useState(false)
  const contentRef: any = React.useRef()
  const finalRef: any = React.useRef()
  const [name, setName] = React.useState("")
  const handleChangeName = (event: SelectChangeEvent) => {
    setName(event.target.value as string)
  }
  const [breed, setBreed] = React.useState("")
  const handleChangeBreed = (event: SelectChangeEvent) => {
    setBreed(event.target.value as string)
  }
  const [gender, setGender] = React.useState("")
  const handleChangeGender = (event: SelectChangeEvent) => {
    setGender(event.target.value as string)
  }
  const [location, setLocation] = React.useState("")
  const handleChangeLocation = (event: SelectChangeEvent) => {
    setLocation(event.target.value as string)
  }
  const [time, setTime] = React.useState("")
  const handleChangeTime = (event: SelectChangeEvent) => {
    setTime(event.target.value as string)
  }
  const [info, setInfo] = React.useState("")
  const handleChangeInfo = (event: SelectChangeEvent) => {
    setInfo(event.target.value as string)
  }
  const [phone, setPhone] = React.useState("")
  const handleChangePhone = (event: SelectChangeEvent) => {
    setPhone(event.target.value as string)
  }
  const [assignedContent, setAssignedContent] = React.useState([1, 2, 3])
  const [isAssigned, setIsAssigned] = React.useState(false)
  const handleAssign = () => {
    setIsAssigned(true)
    setOpen(false)
  }
  const handleChangeOption = (event: SelectChangeEvent) => {
    setOption(event.target.value)
    setTitle(optionTitle.get(event.target.value))
  }
  const [open, setOpen] = React.useState(false)
  const handleOpen = () => setOpen(true)
  const handleClose = () => setOpen(false)

  React.useEffect(() => {
    if (isAssigned) {
      contentRef.current.value = `Tên: ${name}
Giống: ${breed} 
Giới tính: ${gender}
Khu vực lạc: ${location} 
Thời gian lạc: ${time} 
Đặc điểm nhận dạng: ${info}
Sdt liên hệ: ${phone}`
    }
    const footer =
      title === "TÌM CHÓ LẠC" || title === "TÌM MÈO LẠC"
        ? "Nhờ mọi người giành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ."
        : "Nhờ mọi người giành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà ạ. Mình xin cảm ơn."

    finalRef.current.value = `${title}
    
${contentRef.current.value.replaceAll(" :", ":")}
    
${footer}`
  }, [title, isContentChanged, isAssigned, name, gender, breed, location, info,time, phone])

  const handleContent = () => {
    setAssignedContent(contentRef.current.value.split(/\n/))
    setIsContentChanged(!isContentChanged)
  }
  const handleCopy = () => {
    navigator.clipboard
      .writeText(finalRef.current.value)
      .then(() => alert("copy success"))
      .catch(() => alert("copy fail"))
  }
  const handleReload = () => {
    window.location.reload()
  }
  const style = {
    position: "absolute" as "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "80%",
    bgcolor: "background.paper",
    border: "2px solid rgba(207, 76, 247, 0.863);",
    boxShadow: 24,
    p: 4,
    bg: "-moz-linear-gradient(-45deg, rgba(247, 202, 201, 1) 0%, rgba(146, 168, 209, 1) 100%)",
  }
  return (
    <>
      <PetsSharpIcon className="title-icon" />
      <h1>Tìm Chó Mèo Lạc Đà Nẵng</h1>
      <p>Thể loại</p>
      <Box sx={{ minWidth: 120 }}>
        <FormControl color="secondary" className="options">
          <InputLabel id="demo-simple-select-label" className="options"></InputLabel>
          <Select
            labelId="demo-simple-select-label"
            id="demo-simple-select"
            value={option}
            // label="Thể loại"
            onChange={handleChangeOption}
          >
            <MenuItem value={"dog"}>Tìm Chó Lạc</MenuItem>
            <MenuItem value={"cat"}>Tìm Mèo Lạc</MenuItem>
            <MenuItem value={"dogFindOwner"}>Chó lạc tìm chủ</MenuItem>
            <MenuItem value={"catFindOwner"}>Mèo lạc tìm chủ</MenuItem>
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
          <Modal
            open={open}
            onClose={handleClose}
            aria-labelledby="modal-modal-title"
            aria-describedby="modal-modal-description"
          >
            <Box sx={style}>
              <FormControl id="content_title_type" sx={{ m: 1, minWidth: 120, inlineSize: 40 }}>
                <InputLabel id="demo-simple-select-label">Tên</InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={name}
                  label="name"
                  onChange={handleChangeName}
                >
                  {assignedContent.map((contentItem, index) => (
                    <MenuItem key={index} value={contentItem}>
                      {contentItem}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl id="content_title_type" sx={{ m: 1, minWidth: 120, inlineSize: 40 }}>
                <InputLabel id="demo-simple-select-label">Giống</InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={breed}
                  label="breed"
                  onChange={handleChangeBreed}
                >
                  {assignedContent.map((contentItem, index) => (
                    <MenuItem key={index} value={contentItem}>
                      {contentItem}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl id="content_title_type" sx={{ m: 1, minWidth: 120, inlineSize: 40 }}>
                <InputLabel id="demo-simple-select-label">Giới tính</InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={gender}
                  label="gender"
                  onChange={handleChangeGender}
                >
                  {assignedContent.map((contentItem, index) => (
                    <MenuItem key={index} value={contentItem}>
                      {contentItem}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl id="content_title_type" sx={{ m: 1, minWidth: 120, inlineSize: 40 }}>
                <InputLabel id="demo-simple-select-label">Khu vực lạc</InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={location}
                  label="location"
                  onChange={handleChangeLocation}
                >
                  {assignedContent.map((contentItem, index) => (
                    <MenuItem key={index} value={contentItem}>
                      {contentItem}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl id="content_title_type" sx={{ m: 1, minWidth: 120, inlineSize: 40 }}>
                <InputLabel id="demo-simple-select-label">Thời gian lạc</InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={time}
                  label="time"
                  onChange={handleChangeTime}
                >
                  {assignedContent.map((contentItem, index) => (
                    <MenuItem key={index} value={contentItem}>
                      {contentItem}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl id="content_title_type" sx={{ m: 1, minWidth: 120, inlineSize: 40 }}>
                <InputLabel id="demo-simple-select-label">Đặc điểm</InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={info}
                  label="info"
                  onChange={handleChangeInfo}
                >
                  {assignedContent.map((contentItem, index) => (
                    <MenuItem key={index} value={contentItem}>
                      {contentItem}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl id="content_title_type" sx={{ m: 1, minWidth: 120, inlineSize: 40 }}>
                <InputLabel id="demo-simple-select-label">Sdt</InputLabel>
                <Select
                  labelId="demo-simple-select-label"
                  id="demo-simple-select"
                  value={phone}
                  label="phone"
                  onChange={handleChangePhone}
                >
                  {assignedContent.map((contentItem, index) => (
                    <MenuItem key={index} value={contentItem}>
                      {contentItem}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <br />
              <div id="Assign-Reload">
                <Button variant="contained" sx={{ margin: "0 auto" }} onClick={handleAssign}>
                  Assign
                </Button>
                <Button variant="contained" color="error" sx={{ margin: "0 auto" }} onClick={handleReload}>
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
      <button className="button" id="copy-button" data-clipboard-target="#final" onClick={handleCopy}>
        Copy
      </button>
    </>
  )
}
