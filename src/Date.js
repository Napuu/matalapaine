import { useState, useCallback } from "react";
import { Box, Tooltip, Typography, IconButton, Fade, Slide } from "@mui/material";
import moment from "moment";
import { InfoOutlined, AccessTime, Update, Close, ArrowRight } from '@mui/icons-material';
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Container } from './Container';
import Selector from './Selector';
import { useInterval } from './useInterval';
import { teal } from '@mui/material/colors';
import { primaryTeal } from './Theme';

const UpdatingDate = () => {
  const [date, setDate] = useState(moment());
  useInterval(() => {
    setDate(moment());
  }, 1000);
  return <Typography>
    {date.format('MMMM Do YYYY, HH.mm.ss')}
  </Typography>;
};

const Date = ({ date, setDate }) => {
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
  };

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
    <Slide style={{ transitionDelay: visible ? '300ms' : '0ms' }} direction="right" in={visible}>
      <Container style={{ padding: "10px" }}>
        <Box display="flex" flexDirection="row">
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
              <Close htmlColor={teal[400]} fontSize="small" />
            </IconButton>
            <Tooltip
              placement='right'
              style={{ padding: "10px" }}
              title={<>
                <Typography>Source available at <a href="https://github.com/napuu/matalapaine">GitHub</a></Typography>
                <Typography>Weather data itself is from NOAA</Typography>
              </>} open={tooltipOpen}>
              <IconButton onClick={toggleTooltip}>
                <InfoOutlined htmlColor={primaryTeal} fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Selector date={date} setDate={setDate} />
      </Container>
    </Slide>
    <Slide style={{ transitionDelay: visible ? '0ms' : '300ms' }} direction="right" in={!visible}>
      <Container>
        <IconButton
          onClick={open}><ArrowRight fontSize='large' htmlColor={primaryTeal} /></IconButton>
      </Container>
    </Slide>
  </>
  );
};
export default Date;