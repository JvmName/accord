function endRoundValidations() {
    const params              = this.params;
    const submissionValidator = () => {
        const { submission, submitter } = params;
        if (submission  && !submitter) return 'Must include `submitter` when providing submission';
        if (!submission && submitter)  return 'Must include `submission` when providing submitter';
    };
    const stoppageValidator = () => {
        const { stoppage, stopper } = params;
        if (stoppage && !stopper) return 'Must include `stopper` when providing stoppage';
        if (!stoppage && stopper) return 'Must include `stoppage` when providing stopper';
    };

    return {
        submitter: {function: submissionValidator, isEnum: {enums: [undefined, 'red', 'blue']}},
        sumission: {function: submissionValidator},
        stopper:   {function: stoppageValidator,   isEnum: {enums: [undefined, 'red', 'blue']}},
        stoppage:  {function: stoppageValidator}
    }
}


module.exports = {
    endRoundValidations
}
