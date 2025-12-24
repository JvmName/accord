package dev.jvmname.accord.network.model

import dev.drewhamilton.poko.Poko
import dev.jvmname.accord.parcel.CommonParcelable
import dev.jvmname.accord.parcel.CommonParcelize
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable


@[JvmInline Serializable CommonParcelize]
value class MatId(val id: String) : CommonParcelable

@[Poko Serializable CommonParcelize]
class MatInfo(
    val id: MatId,
    val name: String
) : CommonParcelable

@[Poko Serializable]
class CreateMatRequest(
    val name: String,
    @SerialName("judge_count")
    val judgeCount: Int
)