import React, { useState, useEffect } from "react";
import { Box, Paper, Tooltip, Typography, IconButton, Fade, Slide } from "@mui/material";
import moment from "moment";
import { InfoOutlined, AccessTime, Update, Close, ArrowRight } from '@mui/icons-material';

const useInterval = (callback, delay) => {
  const savedCallback = React.useRef();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    let id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]);
};

const UpdatingDate = () => {
  const [date, setDate] = useState(moment());
  useInterval(() => {
    setDate(moment());
  }, 1000);
  return <Typography>
    {date.format('MMMM Do YYYY, HH.mm.ss')}
  </Typography>;
};

const Container = ({ children }) => {
  return (
    <Paper style={{
      color: "rgba(103, 221, 142, 0.87)",
      background: "rgba(10, 10, 10, 0.7)",
      position: "absolute",
      zIndex: 999,
      margin: "10px",
      padding: "10px",
      display: "flex",
    }}>{children}</Paper>
  );
};


const Date = ({ date }) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const toggleTooltip = () => {
    setTooltipOpen(!tooltipOpen);
  };
  const [current, setCurrent] = useState(moment());
  const [open, setOpen] = useState(true);
  useInterval(() => {
    setCurrent(moment());
  }, 1000);

  const boxProps = {
    display: "flex",
    alignItems: "center",
    alignContent: "center",
    padding: "2px"
  };
  const iconProps = {
    style: {
      fontSize: "medium",
      marginRight: "6px",
    }
  };
  if (!date) {
    return null;
  }
  return (<>
    <Container>
      <Box display={"flex"} flexDirection={"column"}>
        <Box {...boxProps}>
          <AccessTime {...iconProps} /><UpdatingDate />
        </Box>
        <Box {...boxProps}>
          <Update {...iconProps} sx={{
            // Update icon seems to be slightly different size than AccessTime
            transform: "scale(1.1125)",
          }} />
          <Typography>
            {date.format('MMMM Do YYYY, HH.00.00')}
          </Typography>
        </Box>
      </Box>
      <Box display="flex" flexDirection="column">
        <IconButton onClick={() => { setOpen(false); }} sx={{ padding: 0 }}>
          <Close htmlColor="rgba(103, 221, 142, 0.87)" fontSize="small" />
        </IconButton>
        <Tooltip
          placement='right'
          style={{ padding: "10px" }}
          title={<>
            <Typography>Source available at <a href="https://github.com/napuu/matalapaine">GitHub</a></Typography>
            <Typography>Weather data itself is from NOAA</Typography>
          </>} open={tooltipOpen}>
          <IconButton onClick={toggleTooltip}>
            <InfoOutlined htmlColor="rgba(103, 221, 142, 0.87)" fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Container>
    <Container>
      <IconButton
        onClick={() => { setOpen(true); }}><ArrowRight htmlColor="rgba(103, 221, 142, 0.87)" /></IconButton>
    </Container>
  </>
  );
};
export default Date;