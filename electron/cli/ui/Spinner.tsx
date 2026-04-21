import React, { useState, useEffect, useRef } from 'react';
import { Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_MS = 250;
const LABEL_TICKS = 20;

interface SpinnerProps {
    labels: string | string[];
}

function randomIndex(len: number, current: number): number {
    if (len <= 1) return 0;
    let next: number;
    do { next = Math.floor(Math.random() * len); } while (next === current);
    return next;
}

const Spinner: React.FC<SpinnerProps> = ({ labels }) => {
    const arr = Array.isArray(labels) ? labels : [labels];
    const [frame, setFrame] = useState(0);
    const [labelIdx, setLabelIdx] = useState(() => Math.floor(Math.random() * Math.max(arr.length, 1)));
    const tickRef = useRef(0);

    useEffect(() => {
        tickRef.current = 0;
        setFrame(0);
        setLabelIdx(arr.length > 1 ? Math.floor(Math.random() * arr.length) : 0);

        const timer = setInterval(() => {
            tickRef.current++;
            setFrame(tickRef.current % FRAMES.length);

            if (arr.length > 1 && tickRef.current % LABEL_TICKS === 0) {
                setLabelIdx((prev) => randomIndex(arr.length, prev));
            }
        }, FRAME_MS);

        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [arr.length, Array.isArray(labels) ? arr.join('\u0000') : String(labels)]);

    return (
        <Text>
            <Text color="cyan">{FRAMES[frame] ?? '⠋'} </Text>
            <Text dimColor>{arr[labelIdx] ?? ''}</Text>
        </Text>
    );
};

export default Spinner;
