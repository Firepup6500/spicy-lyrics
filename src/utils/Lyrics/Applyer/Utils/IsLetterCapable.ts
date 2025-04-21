const Simple = (letterLength: number, totalDuration: number) => {
    if (letterLength > 12) {
        return false;
    }

    const minDuration = 750;
    
    return totalDuration >= minDuration;
}

const Complex = (letterLength: number, totalDuration: number) => {
    // Enforce a maximum letter length of 12
    if (letterLength > 12) {
        return false;
    }

    // Calculate the minimum duration based on the letter length
    const minDuration = 1000 + ((letterLength - 1) / 1) * 25; // Increases duration as letter length increases
    
    // Return whether the letter length and duration meet the criteria
    return totalDuration >= minDuration;
}

export function IsLetterCapable(letterLength: number, totalDuration: number) {
    return Simple(letterLength, totalDuration);
}