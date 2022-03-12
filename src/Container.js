import React from "react";
import { Paper } from "@mui/material";
import { primaryTeal } from './Theme';

export const Container = React.forwardRef((props, ref) => (
  <Paper ref={ref} style={{
    color: primaryTeal,
    background: "rgba(10, 10, 10, 0.7)",
    zIndex: 999,
    margin: "10px",
    position: 'absolute',
    display: "flex",
    flexDirection: "column",
    ...props.style
  }}>{props.children}</Paper>
));
