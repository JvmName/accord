function endRoundValidations() {
    const params              = this.params;
    const submissionValidator = () => {
        const { submission, submitter } = params;
        if (submission  && !submitter) return 'Must include `submitter` when providing submission';
        if (!submission && submitter)  return 'Must include `submission` when providing submitter';
    };

    return {
        submitter: {function: submissionValidator, isEnum: {enums: [undefined, 'red', 'blue']}},
        sumission: {function: submissionValidator} 
    }
}


module.exports = {
    endRoundValidations
}
