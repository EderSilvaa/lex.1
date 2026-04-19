import React, { useState, useEffect, useRef } from 'react';
import { Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
    labels: string | string[];
}

/** Retorna índice aleatório diferente do atual */
function randomIndex(len: number, current: number): number {
    if (len <= 1) return 0;
    let next: number;
    do { next = Math.floor(Math.random() * len); } while (next === current);
    return next;
}

const Spinner: React.FC<SpinnerProps> = ({ labels }) => {
    const arr = Array.isArray(labels) ? labels : [labels];
    const [frame, setFrame] = useState(0);
    const [labelIdx, setLabelIdx] = useState(() => Math.floor(Math.random() * arr.length));
    const tickRef = useRef(0);

    useEffect(() => {
        const timer = setInterval(() => {
            tickRef.current++;
            setFrame(tickRef.current % FRAMES.length);

            // Troca label a cada ~5s (50 ticks × 100ms), ordem aleatória
            if (arr.length > 1 && tickRef.current % 50 === 0) {
                setLabelIdx((prev) => randomIndex(arr.length, prev));
            }
        }, 100);
        return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [arr.length]);

    return (
        <Text>
            <Text color="cyan">{FRAMES[frame]} </Text>
            <Text dimColor>{arr[labelIdx] ?? ''}</Text>
        </Text>
    );
};

export default Spinner;
