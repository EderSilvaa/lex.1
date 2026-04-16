import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
    labels: string | string[];
}

const Spinner: React.FC<SpinnerProps> = ({ labels }) => {
    const arr = Array.isArray(labels) ? labels : [labels];
    const [frame, setFrame] = useState(0);
    const [labelIdx, setLabelIdx] = useState(0);

    useEffect(() => {
        let f = 0;
        let l = 0;
        const timer = setInterval(() => {
            f = (f + 1) % FRAMES.length;
            setFrame(f);
            if (arr.length > 1 && f % 30 === 0) {
                l = (l + 1) % arr.length;
                setLabelIdx(l);
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
