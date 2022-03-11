import React, { useState, useEffect, useCallback } from "react";
import { Box, Paper, Tooltip, Typography, IconButton, Fade, Slide } from "@mui/material";
import moment from "moment";
import { InfoOutlined, AccessTime, Update, Close, ArrowRight } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

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

const Container = React.forwardRef((props, ref) => (
  <Paper ref={ref} style={{
    color: "rgba(103, 221, 142, 0.87)",
    background: "rgba(10, 10, 10, 0.7)",
    position: "absolute",
    zIndex: 999,
    margin: "10px",
    padding: "10px",
    display: "flex",
  }}>{props.children}</Paper>
));

const Date = ({ date }) => {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const toggleTooltip = () => {
    setTooltipOpen(!tooltipOpen);
  };

  const [searchParams, setSearchParams] = useSearchParams();

  const close = () => {
    setTooltipOpen(false);
    const params = new URLSearchParams(searchParams);
    params.set("dateclosed", 1);
    setSearchParams(params);
  };

  const open = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("dateclosed");
    setSearchParams(params);
  }

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
  const visible = searchParams.get("dateclosed") !== "1";
  if (!date) {
    return null;
  }
  return (<>
    <Slide style={{ transitionDelay: visible ? '300ms' : '0ms' }} direction="right" in={visible} mountOnEnter unmountOnExit>
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
          <IconButton onClick={close} sx={{ padding: 0 }}>
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
    </Slide>
    <Slide style={{ transitionDelay: visible ? '0ms' : '300ms' }} direction="right" in={!visible} mountOnEnter unmountOnExit>
      <Container>
        <IconButton
          onClick={open}><ArrowRight htmlColor="rgba(103, 221, 142, 0.87)" /></IconButton>
      </Container>
    </Slide>
  </>
  );
};
export default Date;