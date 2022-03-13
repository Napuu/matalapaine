
import React, { useState } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import { red } from "@mui/material/colors";
import moment from "moment";
import { SkipNext, SkipPrevious, RestartAltOutlined } from '@mui/icons-material';
import { useInterval } from './useInterval';
import { buttonDisabled, primaryTeal } from './Theme';

const Selector = ({ date, setDate }) => {
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [nextAvailable, setNextAvailable] = useState(true);
  const [prevAvailable, setPrevAvailable] = useState(true);
  const hours = 2;

  const resetAvailable = () => {
    setNextAvailable(true);
    setPrevAvailable(true);
  };

  const handlePrevClick = () => {
    resetAvailable();
    const newDate = date.clone().add(-1, "hour");
    setDate(newDate);
    setAutoUpdate(false);
    if (moment().diff(newDate, "hours") >= hours) {
      setPrevAvailable(false);
    }
  };
  const handleNextClick = () => {
    resetAvailable();
    const newDate = date.clone().add(1, "hour");
    setDate(newDate);
    setAutoUpdate(false);
    if (moment().diff(newDate, "hours") < -hours) {
      setNextAvailable(false);
    }
  };
  const handleReset = () => {
    resetAvailable();
    setDate(moment().add(1, "hour"));
    setAutoUpdate(true);
  };

  useInterval(() => {
    const currentHour = moment().hour();
    const dateHour = date.hour();
    const isInCorrectlyShowingCurrentHour = currentHour === dateHour;
    if (autoUpdate && isInCorrectlyShowingCurrentHour) {
      handleReset();
    }
  }, 5000);
  if (!date) {
    return null;
  }
  return (
    <Box display="flex" flexDirection="row" alignItems={"center"}>
      <IconButton disabled={!prevAvailable} style={{ paddingLeft: 0 }} onClick={handlePrevClick}>
        <SkipPrevious htmlColor={prevAvailable ? primaryTeal : buttonDisabled} fontSize="small" />
      </IconButton>
      <IconButton disabled={!nextAvailable} onClick={handleNextClick}>
        <SkipNext htmlColor={nextAvailable ? primaryTeal : buttonDisabled} fontSize="small" />
      </IconButton>

      <IconButton onClick={handleReset}>
        <RestartAltOutlined htmlColor={autoUpdate ? primaryTeal : red[600]} fontSize="small" />
      </IconButton>
      {!autoUpdate && <Typography color={red[300]} style={{ opacity: 0.9 }}>
        Auto-refresh disabled
      </Typography>}
    </Box>
  );
};
export default Selector;