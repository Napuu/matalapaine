import React, { useRef, useEffect } from 'react';
import { Container } from './Container';
import { primaryTeal } from './Theme';
import { Box } from '@mui/system';
import { drawColorRampOnCanvas } from './util';

const Legend = ({ unit, values }) => {
  const legendCanvasRef = useRef(null);

  useEffect(() => {
    drawColorRampOnCanvas(legendCanvasRef.current);
  }, [legendCanvasRef]);

  const width = "200px";
  return (
    <Container style={{
      bottom: "-7px",
      left: "90px",
      pointerEvents: "none",
    }}>
      <Box display="flex" flexDirection="row">
        <Box p="5px" fontSize="small" display="flex">{unit}</Box>
        <Box p="5px" pl={0}>
          <div style={{ zIndex: 10000, display: "flex", position: "absolute", width, paddingTop: "3px" }}>
            {values.map((label, i) => (
              <div key={i} style={{ textAlign: "center", flex: 1, textShadow: "#000 0.5px 0.5px 3px", fontSize: "x-small", color: primaryTeal }}>{label}</div>
            ))}
          </div>
          <div style={{
            overflow: "hidden",
            borderRadius: "4px",
          }}>
            <canvas style={{
              width,
              transform: "scaleY(100)",
            }}
              ref={legendCanvasRef} ></canvas>
          </div>
        </Box>
      </Box>
    </Container>
  );
};

export default Legend;