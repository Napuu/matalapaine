
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
    if (Math.abs(moment().diff(newDate, "hours")) > hours) {
      setPrevAvailable(false);
      return;
    }
    setDate(newDate);
    setPrevAvailable(true);
    setAutoUpdate(false);
  };
  const handleNextClick = () => {
    resetAvailable();
    const newDate = date.clone().add(1, "hour");
    if (Math.abs(date.diff(moment(), "hours")) > hours) {
      setNextAvailable(false);
      return;
    }
    setNextAvailable(true);
    setDate(newDate);
    setAutoUpdate(false);
  };
  const handleReset = () => {
    resetAvailable();
    setDate(moment().add(1, "hour"));
    setAutoUpdate(true);
  };

  useInterval(() => {
    if (autoUpdate) handleReset();
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