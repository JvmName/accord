package dev.jvmname.accord.network.model

import dev.drewhamilton.poko.Poko


@JvmInline
value class MatId(val id: String)

@Poko
 class MatInfo(
    val id: MatId,
    val name: String
)