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

export default function Ctdv() {
  const [option, setOption] = React.useState("dog")
  const [title, setTitle] = React.useState("TÌM CHÓ LẠC")
  const contentRef: any = React.useRef()
  const finalRef: any = React.useRef()

  const handleChange = (event: SelectChangeEvent) => {
    setOption(event.target.value as string)
    switch (event.target.value) {
      case "dog":
        setTitle("TÌM CHÓ LẠC")
        break
      case "cat":
        setTitle("TÌM MÈO LẠC")
        break
      case "dogFindOwner":
        setTitle("CHÓ LẠC TÌM CHỦ")
        break
      case "catFindOwner":
        setTitle("MÈO LẠC TÌM CHỦ")
        break
    }
    handleContent()
  }

  const handleContent = () => {
    const footer =
      option === "dog" || option === "cat"
        ? "Nhờ mọi người giành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà. Mình cảm ơn và xin chân thành hậu tạ cho ai giúp tìm được bé ạ."
        : "Nhờ mọi người giành chút thời gian chia sẻ bài viết để bé có thể sớm về nhà ạ. Mình xin cảm ơn."

    finalRef.current.value = `${title}
    
${contentRef.current.value.replaceAll(" :", ":")}
    
${footer}`
  }

  const handleCopy = () => {
    navigator.clipboard
      .writeText(finalRef.current.value)
      .then(() => alert("copy success"))
      .catch(() => alert("copy fail"))
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
            onChange={handleChange}
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
